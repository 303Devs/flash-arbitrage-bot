// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

// ========== INTERFACES ==========

interface IVault {
    function flashLoan(
        address recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

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
 * Key design decisions:
 * - No hardcoded router addresses: all DEX routers are whitelisted via constructor/admin
 * - This makes the same contract deployable on any chain without code changes
 * - Pre-flash balance tracking ensures accurate profit calculation
 * - Custom errors save gas vs require strings
 * - 400k gas per swap covers all major DEX types
 */
contract ZeroCapitalArbitrage is
    IFlashLoanRecipient,
    IFlashLoanReceiver,
    Ownable2Step,
    ReentrancyGuard,
    Pausable
{
    using SafeERC20 for IERC20;

    // Balancer vault is the same address on all chains
    IVault private constant BALANCER_VAULT = IVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);

    /**
     * @dev Gas limit for each DEX call. 400k covers:
     * - Uniswap V3 multi-hop (~350k gas)
     * - Uniswap V2 / SushiSwap (~150k gas)
     * - Balancer single swap (~200k gas)
     * - Curve (~100k gas)
     * - Aerodrome / Camelot (~170k gas)
     */
    uint256 private constant MAX_SWAP_GAS = 400_000;

    // Custom errors (saves gas vs require strings)
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

    enum FlashLoanProvider { BALANCER, AAVE }

    struct ArbitrageParams {
        FlashLoanProvider provider;
        address tokenIn;
        address tokenOut;
        uint256 flashAmount;
        uint256 minProfit;
        address dexA;            // Buy from (cheaper)
        address dexB;            // Sell to (expensive)
        bytes swapDataA;         // ABI-encoded DEX call for first swap
        bytes swapDataB;         // ABI-encoded DEX call for second swap
        address executor;        // Who initiated this (set by contract, not caller)
        uint256 preFlashBalance; // Token balance before flash loan (set by contract)
    }

    IPool public immutable aavePool;
    mapping(address => bool) public authorizedExecutors;
    mapping(address => bool) public whitelistedDEXs;
    mapping(address => uint256) public totalProfits;
    mapping(address => uint256) public withdrawnProfits;

    event ArbitrageExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 flashAmount,
        uint256 profit,
        FlashLoanProvider provider,
        address indexed executor
    );
    event ProfitWithdrawn(address indexed token, uint256 amount, address indexed to);
    event ExecutorUpdated(address indexed executor, bool authorized);
    event DEXWhitelisted(address indexed dex, bool whitelisted);
    event EmergencyWithdraw(address indexed token, uint256 amount, address indexed to);
    event EmergencyETHWithdraw(address indexed to, uint256 amount);

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

    /**
     * @param _aavePool Aave V3 pool address (chain-specific)
     * @param _initialDEXs Chain-specific DEX router addresses to whitelist at deployment
     */
    constructor(address _aavePool, address[] memory _initialDEXs)
        validAddress(_aavePool)
        Ownable2Step()
        Ownable(msg.sender)
    {
        aavePool = IPool(_aavePool);
        authorizedExecutors[msg.sender] = true;

        for (uint256 i = 0; i < _initialDEXs.length; i++) {
            if (_initialDEXs[i] != address(0)) {
                whitelistedDEXs[_initialDEXs[i]] = true;
                emit DEXWhitelisted(_initialDEXs[i], true);
            }
        }
    }

    /**
     * @notice Execute flash loan arbitrage
     * @param params Arbitrage parameters (dexA/dexB must be whitelisted)
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
        if (!whitelistedDEXs[params.dexA]) revert InvalidDEX(params.dexA);
        if (!whitelistedDEXs[params.dexB]) revert InvalidDEX(params.dexB);

        // Capture pre-flash balance for accurate profit calculation
        uint256 preFlashBalance = IERC20(params.tokenIn).balanceOf(address(this));

        ArbitrageParams memory internalParams = ArbitrageParams({
            provider:       params.provider,
            tokenIn:        params.tokenIn,
            tokenOut:       params.tokenOut,
            flashAmount:    params.flashAmount,
            minProfit:      params.minProfit,
            dexA:           params.dexA,
            dexB:           params.dexB,
            swapDataA:      params.swapDataA,
            swapDataB:      params.swapDataB,
            executor:       msg.sender, // Use actual caller, not spoofable calldata
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

    // ========== FLASH LOAN CALLBACKS ==========

    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override onlyCallback(address(BALANCER_VAULT)) {
        ArbitrageParams memory params = abi.decode(userData, (ArbitrageParams));
        uint256 totalOwed = amounts[0] + feeAmounts[0];

        uint256 finalBalance = _executeArbitrageLogic(params, amounts[0]);
        uint256 actualProfit = finalBalance - params.preFlashBalance;

        if (actualProfit < totalOwed + params.minProfit) revert InsufficientProfit();

        tokens[0].safeTransfer(address(BALANCER_VAULT), totalOwed);

        uint256 netProfit = actualProfit - totalOwed;
        totalProfits[params.tokenIn] += netProfit;

        emit ArbitrageExecuted(
            params.tokenIn, params.tokenOut, amounts[0],
            netProfit, FlashLoanProvider.BALANCER, params.executor
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata data
    ) external override onlyCallback(address(aavePool)) returns (bool) {
        if (initiator != address(this)) revert InvalidCallback();

        ArbitrageParams memory params = abi.decode(data, (ArbitrageParams));
        uint256 totalOwed = amounts[0] + premiums[0];

        uint256 finalBalance = _executeArbitrageLogic(params, amounts[0]);
        uint256 actualProfit = finalBalance - params.preFlashBalance;

        if (actualProfit < totalOwed + params.minProfit) revert InsufficientProfit();

        IERC20(assets[0]).safeIncreaseAllowance(address(aavePool), totalOwed);

        uint256 netProfit = actualProfit - totalOwed;
        totalProfits[params.tokenIn] += netProfit;

        emit ArbitrageExecuted(
            params.tokenIn, params.tokenOut, amounts[0],
            netProfit, FlashLoanProvider.AAVE, params.executor
        );

        return true;
    }

    // ========== INTERNAL LOGIC ==========

    function _executeArbitrageLogic(
        ArbitrageParams memory params,
        uint256 flashAmount
    ) private returns (uint256 finalBalance) {
        IERC20 tokenIn  = IERC20(params.tokenIn);
        IERC20 tokenOut = IERC20(params.tokenOut);

        // Step 1: Buy tokenOut using tokenIn on DEX A (cheaper DEX)
        tokenIn.safeIncreaseAllowance(params.dexA, flashAmount);

        (bool success1, bytes memory reason1) = params.dexA.call{gas: MAX_SWAP_GAS}(params.swapDataA);
        if (!success1) revert SwapFailed(params.dexA, reason1);

        // Reset allowance for security
        uint256 remainingAllowanceA = tokenIn.allowance(address(this), params.dexA);
        if (remainingAllowanceA > 0) {
            tokenIn.safeDecreaseAllowance(params.dexA, remainingAllowanceA);
        }

        uint256 tokenOutBalance = tokenOut.balanceOf(address(this));
        if (tokenOutBalance == 0) revert SwapFailed(params.dexA, "No tokens received from DEX A");

        // Step 2: Sell tokenOut back to tokenIn on DEX B (expensive DEX)
        tokenOut.safeIncreaseAllowance(params.dexB, tokenOutBalance);

        (bool success2, bytes memory reason2) = params.dexB.call{gas: MAX_SWAP_GAS}(params.swapDataB);
        if (!success2) revert SwapFailed(params.dexB, reason2);

        uint256 remainingAllowanceB = tokenOut.allowance(address(this), params.dexB);
        if (remainingAllowanceB > 0) {
            tokenOut.safeDecreaseAllowance(params.dexB, remainingAllowanceB);
        }

        finalBalance = tokenIn.balanceOf(address(this));

        if (finalBalance < params.preFlashBalance + flashAmount) revert InsufficientProfit();
    }

    function _executeBalancerFlashLoan(ArbitrageParams memory params) private {
        IERC20[] memory tokens  = new IERC20[](1);
        tokens[0] = IERC20(params.tokenIn);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = params.flashAmount;

        BALANCER_VAULT.flashLoan(address(this), tokens, amounts, abi.encode(params));
    }

    function _executeAaveFlashLoan(ArbitrageParams memory params) private {
        address[] memory assets  = new address[](1);
        assets[0] = params.tokenIn;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = params.flashAmount;

        uint256[] memory modes   = new uint256[](1);
        modes[0] = 0; // No debt

        aavePool.flashLoan(address(this), assets, amounts, modes, address(this), abi.encode(params), 0);
    }

    // ========== ADMIN ==========

    function updateExecutor(address executor, bool authorized)
        external onlyOwner validAddress(executor)
    {
        authorizedExecutors[executor] = authorized;
        emit ExecutorUpdated(executor, authorized);
    }

    function updateDEXWhitelist(address dex, bool whitelisted)
        external onlyOwner validAddress(dex)
    {
        whitelistedDEXs[dex] = whitelisted;
        emit DEXWhitelisted(dex, whitelisted);
    }

    function withdrawProfits(address token, uint256 amount, address to)
        external onlyOwner validAddress(token) validAddress(to) validAmount(amount)
    {
        uint256 available = totalProfits[token] - withdrawnProfits[token];
        if (amount > available) revert InvalidAmount();
        withdrawnProfits[token] += amount;
        IERC20(token).safeTransfer(to, amount);
        emit ProfitWithdrawn(token, amount, to);
    }

    function emergencyWithdraw(address token, address to)
        external onlyOwner whenPaused validAddress(token) validAddress(to)
    {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).safeTransfer(to, balance);
            emit EmergencyWithdraw(token, balance, to);
        }
    }

    function pause()   external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ========== VIEWS ==========

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

    // ========== ETH HANDLING ==========

    receive()  external payable {}
    fallback()  external { revert InvalidCall(); }

    function withdrawETH(address payable to) external onlyOwner validAddress(to) {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            (bool ok,) = to.call{value: balance}("");
            if (!ok) revert TransferFailed();
            emit EmergencyETHWithdraw(to, balance);
        }
    }
}
