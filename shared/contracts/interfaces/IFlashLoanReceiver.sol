// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @dev Interface for flash loan receivers
 * Compatible with Aave V3, Balancer V2, and Uniswap V3
 */
interface IFlashLoanReceiver {
    /**
     * @dev Executes an operation after receiving the flash-loaned amount
     * @param assets The addresses of the flash-loaned assets
     * @param amounts The amounts fo the flash-loaned assets
     * @param premiums The fee of the flash-loaned assets
     * @param initiator The address of the flashloan initiator
     * @param params The byte-encoded params passed when initiating the flashloan
     * @return True if the execution of the operation succeeds, false otherwise
     */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}