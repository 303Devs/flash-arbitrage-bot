/**
 * Decimal precision fixes & opportunity validation
 *
 * Production lessons learned:
 * 1. USDC = 6 decimals. Treating it as 18 = 10^12x profit overestimate.
 * 2. Opportunities go stale in ~2-5s. Reject anything older than 5s.
 * 3. Use conservative amounts: ~20% of optimistic estimate.
 * 4. Always normalize to 18 decimals before arithmetic.
 */

import { ethers } from 'ethers';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ExecutionResult {
  success: boolean;
  hash?: string;
  gasUsed?: bigint;
  error?: string;
}

const CONTRACT_ABI = [
  `function executeArbitrage(
    tuple(
      uint8 provider,
      address tokenIn,
      address tokenOut,
      uint256 flashAmount,
      uint256 minProfit,
      address dexA,
      address dexB,
      bytes swapDataA,
      bytes swapDataB,
      address executor,
      uint256 preFlashBalance
    ) params
  ) external`,
  'function isAuthorizedExecutor(address) external view returns (bool)',
  'function getTokenBalance(address) external view returns (uint256)',
  'function getAvailableProfit(address) external view returns (uint256)',
  'event ArbitrageExecuted(address indexed tokenIn, address indexed tokenOut, uint256 flashAmount, uint256 profit, uint8 provider, address indexed executor)',
];

/**
 * Validate an opportunity before execution
 * Rejects stale, unprofitable, or suspiciously large opportunities
 */
export function validateOpportunity(opportunity: {
  id: string;
  timestamp: number;
  expectedProfit: number;
  chainId: number;
}): ValidationResult {
  // 1. Staleness check - opportunities expire in 5 seconds
  const ageMs = Date.now() - opportunity.timestamp;
  if (ageMs > 5_000) {
    return { valid: false, reason: `Stale opportunity (${ageMs}ms > 5000ms)` };
  }

  // 2. Profit sanity
  if (opportunity.expectedProfit <= 0) {
    return { valid: false, reason: 'Non-positive expected profit' };
  }

  // 3. Minimum profit floor (avoids dust trades that lose money after gas)
  const MIN_PROFIT_USD: Record<number, number> = { 42161: 3, 137: 1, 8453: 2 };
  const minProfit = MIN_PROFIT_USD[opportunity.chainId] ?? 2;
  if (opportunity.expectedProfit < minProfit) {
    return { valid: false, reason: `Profit $${opportunity.expectedProfit.toFixed(2)} below min $${minProfit}` };
  }

  // 4. Cap suspiciously large profits (likely decimal bug)
  if (opportunity.expectedProfit > 50_000) {
    return { valid: false, reason: `Profit $${opportunity.expectedProfit.toFixed(0)} suspiciously large - likely decimal error` };
  }

  return { valid: true };
}

/**
 * Execute arbitrage with proper decimal handling
 *
 * NOTE: This function handles the contract call but the actual swap calldata
 * (swapDataA, swapDataB) must be built by the caller using DEX-specific encoding.
 *
 * For Uniswap V3: encode exactInputSingle()
 * For Uniswap V2: encode swapExactTokensForTokens()
 * For Balancer: encode swap()
 */
export async function executeArbitrageFixed(
  opportunity: {
    id: string;
    chainId: number;
    tokenA: { address: string };
    tokenB: { address: string };
    dexA: { router: string };
    dexB: { router: string };
    optimalAmount: number;   // USD amount
    estimatedProfit: number; // USD
    timestamp: number;
    swapDataA?: string;      // hex-encoded calldata for DEX A swap
    swapDataB?: string;      // hex-encoded calldata for DEX B swap
  },
  contract: ethers.Contract,
  provider: ethers.Provider
): Promise<ExecutionResult> {
  try {
    // Validate before execution
    const validation = validateOpportunity({
      id: opportunity.id,
      timestamp: opportunity.timestamp,
      expectedProfit: opportunity.estimatedProfit,
      chainId: opportunity.chainId,
    });

    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // Conservative amount: 20% of optimistic estimate, $300-$1000 range
    // Flash loans provide all capital, so we risk nothing by being conservative
    const conservativeAmount = Math.min(
      Math.max(opportunity.optimalAmount * 0.2, 300),
      1000
    );

    // Convert USD amount to token units
    // NOTE: This is approximate. Real implementation needs on-chain quote.
    const flashAmountWei = ethers.parseUnits(conservativeAmount.toFixed(6), 6); // USDC units

    // minProfit: require at least $1 profit to cover gas
    const minProfitWei = ethers.parseUnits('1', 6); // $1 in USDC units

    // Build ArbitrageParams struct
    const params = {
      provider: 0, // 0 = BALANCER (free flash loans), 1 = AAVE (0.09% fee)
      tokenIn:  opportunity.tokenA.address,
      tokenOut: opportunity.tokenB.address,
      flashAmount: flashAmountWei,
      minProfit:   minProfitWei,
      dexA:      opportunity.dexA.router,
      dexB:      opportunity.dexB.router,
      swapDataA: opportunity.swapDataA || '0x', // TODO: build from DEX router
      swapDataB: opportunity.swapDataB || '0x', // TODO: build from DEX router
      executor:  await (contract.runner as ethers.Wallet)?.getAddress?.() || ethers.ZeroAddress,
      preFlashBalance: 0n, // Contract captures this on-chain
    };

    const tx = await contract.executeArbitrage(params, {
      gasLimit: 800_000,
    });

    const receipt = await tx.wait();

    return {
      success: receipt.status === 1,
      hash:    tx.hash,
      gasUsed: receipt.gasUsed,
    };

  } catch (err: any) {
    return {
      success: false,
      error: err.reason || err.message || 'Unknown error',
    };
  }
}
