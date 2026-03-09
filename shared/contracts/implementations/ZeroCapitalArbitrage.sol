// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

// ========== INTERFACES ==========

/**
 * @notice Balancer Vault interface
 */
interface IVault {
    function flashLoan(
        address recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

/**
 * @notice Balancer flash loan recipient interface
 */
interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

/**
 * @notice Aave Pool interface
 */
interface IPool {
    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata modes,
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

/**
 * @notice Aave flash loan receiver interface
 */
interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

/**
 * @title ZeroCapitalArbitrage
 * @notice Gas-optimized flash loan arbitrage contract supporting Aave V3 and Balancer V2
 * @dev Supports cross-DEX arbitrage with zero trading capital (flash loans provide capital)
 *
 * Key learnings from production:
 * - Track pre-flash balance for accurate profit calculation
 * - Reset allowances after each swap for security
 * - Use 400k gas per swap as realistic estimate (not the 800k limit)
 * - Custom errors save gas vs require strings
 */
contract ZeroCapitalArbitrage is
    IFlashLoanRecipient,
    IFlashLoanReceiver,
    Ownable2Step,
    ReentrancyGuard,
    Pausable
{
    using SafeERC20 for IERC20;

    // Constants
    IVault private constant BALANCER_VAULT = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);

    /**
     * @dev Gas limit for DEX swaps - conservatively set to 400k to cover:
     * - Uniswap V3 multi-hop swaps (up to 4 hops ~350k gas)
     * - Uniswap V2 swaps (~150k gas)
     * - SushiSwap swaps (~150k gas)
     * - Balancer swaps (~200k gas)
     * - Curve swaps (~100k gas)
     * This ensures compatibility with complex routing while preventing gas bombs
     */
    uint256 private constant MAX_SWAP_GAS = 400000;

    // Immutable router addresses for gas optimization
    address private immutable UNISWAP_V3_ROUTER = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address private immutable UNISWAP_V2_ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address private immutable SUSHISWAP_ROUTER = 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506;

    // Custom errors for gas optimization
    error InvalidAmount();
    error InvalidAddress();
    error InsufficientProfit();
    error UnauthorizedExecutor();
    error InvalidCallback();
    error UnsupportedProvider();
    error SwapFailed(address dex, bytes reason);
    error InvalidDEX(address dex);
    error TransferFailed();
    error InvalidCall();

    // Enums
    enum FlashLoanProvider { BALANCER, AAVE }

    // Structs - optimized for gas
    struct ArbitrageParams {
        FlashLoanProvider provider;
        address tokenIn;
        address tokenOut;
        uint256 flashAmount;
        uint256 minProfit;
        address dexA;           // Buy from (lower price)
        address dexB;           // Sell to (higher price)
        bytes swapDataA;        // Calldata for first swap
        bytes swapDataB;        // Calldata for second swap
        address executor;       // Who initiated this arbitrage
        uint256 preFlashBalance; // Token balance before flash loan
    }

    // State variables
    IPool public immutable aavePool; // Immutable for gas optimization
    mapping(address => bool) public authorizedExecutors;
    mapping(address => bool) public whitelistedDEXs;
    mapping(address => uint256) public totalProfits;
    mapping(address => uint256) public withdrawnProfits;

    // Events
    event ArbitrageExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 flashAmount,
        uint256 profit,
        FlashLoanProvider provider,
        address indexed executor
    );

    event ProfitWithdrawn(
        address indexed token,
        uint256 amount,
        address indexed to
    );

    event ExecutorUpdated(address indexed executor, bool authorized);
    event DEXWhitelisted(address indexed dex, bool whitelisted);
    event EmergencyWithdraw(address indexed token, uint256 amount, address indexed to);
    event EmergencyETHWithdraw(address indexed to, uint256 amount);

    // Modifiers
    modifier onlyExecutor() {
        if (!authorizedExecutors[msg.sender]) revert UnauthorizedExecutor();
        _;
    }

    modifier onlyCallback(address expectedCaller) {
        if (msg.sender != expectedCaller) revert InvalidCallback();
        _;
    }

    modifier validAddress(address addr) {
        if (addr == address(0)) revert InvalidAddress();
        _;
    }

    modifier validAmount(uint256 amount) {
        if (amount == 0) revert InvalidAmount();
        _;
    }

    constructor(address _aavePool) validAddress(_aavePool) {
        aavePool = IPool(_aavePool);
        authorizedExecutors[msg.sender] = true;

        // Whitelist major DEX routers by default
        _whitelistCommonDEXs();
    }

    /**
     * @notice Execute flash loan arbitrage
     * @param params Arbitrage parameters
     */
    function executeArbitrage(ArbitrageParams calldata params)
        external
        onlyExecutor
        nonReentrant
        whenNotPaused
        validAddress(params.tokenIn)
        validAddress(params.tokenOut)
        validAddress(params.dexA)
        validAddress(params.dexB)
        validAmount(params.flashAmount)
        validAmount(params.minProfit)
    {
        // Validate DEXs are whitelisted
        if (!whitelistedDEXs[params.dexA]) revert InvalidDEX(params.dexA);
        if (!whitelistedDEXs[params.dexB]) revert InvalidDEX(params.dexB);

        // Capture pre-flash balance for accurate profit calculation
        uint256 preFlashBalance = IERC20(params.tokenIn).balanceOf(address(this));

        // Create internal params with pre-flash balance
        ArbitrageParams memory internalParams = ArbitrageParams({
            provider: params.provider,
            tokenIn: params.tokenIn,
            tokenOut: params.tokenOut,
            flashAmount: params.flashAmount,
            minProfit: params.minProfit,
            dexA: params.dexA,
            dexB: params.dexB,
            swapDataA: params.swapDataA,
            swapDataB: params.swapDataB,
            executor: msg.sender, // Use actual caller, not spoofable calldata
            preFlashBalance: preFlashBalance
        });

        if (params.provider == FlashLoanProvider.BALANCER) {
            _executeBalancerFlashLoan(internalParams);
        } else if (params.provider == FlashLoanProvider.AAVE) {
            _executeAaveFlashLoan(internalParams);
        } else {
            revert UnsupportedProvider();
        }
    }

    /**
     * @notice Balancer flash loan callback
     */
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override onlyCallback(address(BALANCER_VAULT)) {

        ArbitrageParams memory params = abi.decode(userData, (ArbitrageParams));
        uint256 totalOwed = amounts[0] + feeAmounts[0];

        uint256 finalBalance = _executeArbitrageLogic(params, amounts[0]);

        // Calculate actual profit: final balance - pre-flash balance - fees
        uint256 actualProfit = finalBalance - params.preFlashBalance;

        if (actualProfit < totalOwed + params.minProfit) {
            revert InsufficientProfit();
        }

        // Repay flash loan
        tokens[0].safeTransfer(address(BALANCER_VAULT), totalOwed);

        // Record net profit (profit after all costs)
        uint256 netProfit = actualProfit - totalOwed;
        totalProfits[params.tokenIn] += netProfit;

        emit ArbitrageExecuted(
            params.tokenIn,
            params.tokenOut,
            amounts[0],
            netProfit,
            FlashLoanProvider.BALANCER,
            params.executor
        );
    }

    /**
     * @notice Aave flash loan callback
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata data
    ) external override onlyCallback(address(aavePool)) returns (bool) {
        if (initiator != address(this)) revert InvalidCallback();

        ArbitrageParams memory arbitrageParams = abi.decode(data, (ArbitrageParams));
        uint256 totalOwed = amounts[0] + premiums[0];

        uint256 finalBalance = _executeArbitrageLogic(arbitrageParams, amounts[0]);

        // Calculate actual profit: final balance - pre-flash balance - fees
        uint256 actualProfit = finalBalance - arbitrageParams.preFlashBalance;

        if (actualProfit < totalOwed + arbitrageParams.minProfit) {
            revert InsufficientProfit();
        }

        // Approve repayment (Aave pulls this automatically)
        IERC20(assets[0]).safeIncreaseAllowance(address(aavePool), totalOwed);

        // Record net profit (profit after all costs)
        uint256 netProfit = actualProfit - totalOwed;
        totalProfits[arbitrageParams.tokenIn] += netProfit;

        emit ArbitrageExecuted(
            arbitrageParams.tokenIn,
            arbitrageParams.tokenOut,
            amounts[0],
            netProfit,
            FlashLoanProvider.AAVE,
            arbitrageParams.executor
        );

        return true;
    }

    /**
     * @notice Core arbitrage logic with enhanced error handling
     * @return finalBalance The final token balance after arbitrage
     */
    function _executeArbitrageLogic(
        ArbitrageParams memory params,
        uint256 flashAmount
    ) private returns (uint256 finalBalance) {
        IERC20 tokenIn = IERC20(params.tokenIn);
        IERC20 tokenOut = IERC20(params.tokenOut);

        // Step 1: Swap tokenIn -> tokenOut on DEX A (buy from cheaper DEX)
        tokenIn.safeIncreaseAllowance(params.dexA, flashAmount);

        (bool success1, bytes memory reason1) = params.dexA.call{gas: MAX_SWAP_GAS}(params.swapDataA);
        if (!success1) {
            revert SwapFailed(params.dexA, reason1);
        }

        // Reset allowance for security
        if (tokenIn.allowance(address(this), params.dexA) > 0) {
            tokenIn.safeDecreaseAllowance(params.dexA, tokenIn.allowance(address(this), params.dexA));
        }

        uint256 tokenOutBalance = tokenOut.balanceOf(address(this));
        if (tokenOutBalance == 0) revert SwapFailed(params.dexA, "No tokens received");

        // Step 2: Swap tokenOut -> tokenIn on DEX B (sell to expensive DEX)
        tokenOut.safeIncreaseAllowance(params.dexB, tokenOutBalance);

        (bool success2, bytes memory reason2) = params.dexB.call{gas: MAX_SWAP_GAS}(params.swapDataB);
        if (!success2) {
            revert SwapFailed(params.dexB, reason2);
        }

        // Reset allowance for security
        if (tokenOut.allowance(address(this), params.dexB) > 0) {
            tokenOut.safeDecreaseAllowance(params.dexB, tokenOut.allowance(address(this), params.dexB));
        }

        finalBalance = tokenIn.balanceOf(address(this));

        // Sanity check: we should have at least the pre-flash balance + flash amount
        if (finalBalance < params.preFlashBalance + flashAmount) {
            revert InsufficientProfit();
        }
    }

    /**
     * @notice Execute Balancer flash loan
     */
    function _executeBalancerFlashLoan(ArbitrageParams memory params) private {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(params.tokenIn);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = params.flashAmount;

        BALANCER_VAULT.flashLoan(address(this), tokens, amounts, abi.encode(params));
    }

    /**
     * @notice Execute Aave flash loan
     */
    function _executeAaveFlashLoan(ArbitrageParams memory params) private {
        address[] memory assets = new address[](1);
        assets[0] = params.tokenIn;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = params.flashAmount;

        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; // No debt

        aavePool.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            abi.encode(params),
            0
        );
    }

    /**
     * @notice Whitelist common DEX routers
     */
    function _whitelistCommonDEXs() private {
        whitelistedDEXs[UNISWAP_V3_ROUTER] = true;
        emit DEXWhitelisted(UNISWAP_V3_ROUTER, true);

        whitelistedDEXs[UNISWAP_V2_ROUTER] = true;
        emit DEXWhitelisted(UNISWAP_V2_ROUTER, true);

        whitelistedDEXs[SUSHISWAP_ROUTER] = true;
        emit DEXWhitelisted(SUSHISWAP_ROUTER, true);
    }

    // ========== ADMIN FUNCTIONS ==========

    function updateExecutor(address executor, bool authorized)
        external
        onlyOwner
        validAddress(executor)
    {
        authorizedExecutors[executor] = authorized;
        emit ExecutorUpdated(executor, authorized);
    }

    function updateDEXWhitelist(address dex, bool whitelisted)
        external
        onlyOwner
        validAddress(dex)
    {
        whitelistedDEXs[dex] = whitelisted;
        emit DEXWhitelisted(dex, whitelisted);
    }

    function withdrawProfits(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner validAddress(token) validAddress(to) validAmount(amount) {
        uint256 availableProfit = totalProfits[token] - withdrawnProfits[token];
        if (amount > availableProfit) revert InvalidAmount();

        withdrawnProfits[token] += amount;
        IERC20(token).safeTransfer(to, amount);

        emit ProfitWithdrawn(token, amount, to);
    }

    function emergencyWithdraw(address token, address to)
        external
        onlyOwner
        whenPaused
        validAddress(token)
        validAddress(to)
    {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(to, balance);
            emit EmergencyWithdraw(token, balance, to);
        }
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ========== VIEW FUNCTIONS ==========

    function getAvailableProfit(address token) external view returns (uint256) {
        return totalProfits[token] - withdrawnProfits[token];
    }

    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function isAuthorizedExecutor(address executor) external view returns (bool) {
        return authorizedExecutors[executor];
    }

    function isDEXWhitelisted(address dex) external view returns (bool) {
        return whitelistedDEXs[dex];
    }

    function getAavePool() external view returns (address) {
        return address(aavePool);
    }

    // ========== EMERGENCY FUNCTIONS ==========

    receive() external payable {}

    fallback() external {
        revert InvalidCall();
    }

    function withdrawETH(address payable to) external onlyOwner validAddress(to) {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool success, ) = to.call{value: balance}("");
            if (!success) revert TransferFailed();
            emit EmergencyETHWithdraw(to, balance);
        }
    }
}
