/**
 * Dynamic gas optimizer
 * Competitive EIP-1559 gas pricing to win against other bots
 *
 * Key lesson from production: always use REALISTIC gas usage (~400k)
 * not the gas limit (800k) for profit calculations.
 */

import { ethers } from 'ethers';
import { logger } from '../monitoring/logger.js';

interface GasConfig {
  chainId: number;
  baseGasPrice: bigint;
  maxGasPrice: bigint;
  competitionMultiplier: number; // multiply network gas price by this
}

export interface GasEstimate {
  gasPrice: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  gasLimit: bigint;
}

const GAS_CONFIGS: Record<number, GasConfig> = {
  42161: { // Arbitrum
    chainId: 42161,
    baseGasPrice: BigInt('100000000'),  // 0.1 gwei
    maxGasPrice:  BigInt('5000000000'), // 5 gwei
    competitionMultiplier: 2.0,
  },
  137: { // Polygon
    chainId: 137,
    baseGasPrice: BigInt('30000000000'),  // 30 gwei
    maxGasPrice:  BigInt('150000000000'), // 150 gwei
    competitionMultiplier: 2.0,
  },
  8453: { // Base
    chainId: 8453,
    baseGasPrice: BigInt('50000000'),   // 0.05 gwei
    maxGasPrice:  BigInt('3000000000'), // 3 gwei
    competitionMultiplier: 2.0,
  },
};

export class DynamicGasOptimizer {
  private recentFailures = new Map<string, number>();

  async getOptimalGasParams(
    chainId: number,
    provider: ethers.Provider,
    opportunityId?: string,
    isRetry = false
  ): Promise<GasEstimate> {
    const cfg = GAS_CONFIGS[chainId];
    if (!cfg) throw new Error(`No gas config for chain ${chainId}`);

    try {
      const feeData = await provider.getFeeData();
      let multiplier = cfg.competitionMultiplier;

      // Increase aggressiveness on retries
      if (isRetry && opportunityId) {
        const retries = this.recentFailures.get(opportunityId) || 0;
        multiplier = cfg.competitionMultiplier * (1 + retries);
      }

      let gasPrice: bigint;
      let maxFeePerGas: bigint;
      let maxPriorityFeePerGas: bigint;

      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        // EIP-1559 (Polygon, Base)
        maxPriorityFeePerGas = BigInt(Math.floor(Number(feeData.maxPriorityFeePerGas) * multiplier));
        maxFeePerGas = BigInt(Math.floor(Number(feeData.maxFeePerGas) * multiplier)) + maxPriorityFeePerGas;

        if (maxFeePerGas > cfg.maxGasPrice) {
          maxFeePerGas = cfg.maxGasPrice;
          maxPriorityFeePerGas = maxFeePerGas / 2n;
        }

        gasPrice = maxFeePerGas;
      } else {
        // Legacy (Arbitrum)
        const network = feeData.gasPrice || cfg.baseGasPrice;
        gasPrice = BigInt(Math.floor(Number(network) * multiplier));
        if (gasPrice > cfg.maxGasPrice) gasPrice = cfg.maxGasPrice;
        maxFeePerGas = gasPrice;
        maxPriorityFeePerGas = gasPrice / 2n;
      }

      if (isRetry) {
        logger.info('🔥 Competitive gas (retry)', {
          chainId,
          gasPrice: `${(Number(gasPrice) / 1e9).toFixed(2)} gwei`,
          multiplier,
        });
      }

      return { gasPrice, maxFeePerGas, maxPriorityFeePerGas, gasLimit: 800_000n };

    } catch (err: any) {
      logger.error('Gas estimation failed, using fallback', { chainId, error: err.message });
      const fallback = cfg.maxGasPrice / 2n;
      return { gasPrice: fallback, maxFeePerGas: fallback, maxPriorityFeePerGas: fallback / 2n, gasLimit: 800_000n };
    }
  }

  recordFailure(opportunityId: string, reason: string): void {
    if (reason.includes('replacement fee too low') || reason.includes('underpriced')) {
      const count = (this.recentFailures.get(opportunityId) || 0) + 1;
      this.recentFailures.set(opportunityId, count);
      logger.warn('Gas war detected - increasing aggressiveness', { opportunityId, retryCount: count });
    }
  }

  /**
   * Calculate net profit after realistic gas costs
   * IMPORTANT: Use realistic usage (400k), NOT the gas limit (800k)
   */
  calculateNetProfit(
    estimatedProfitUSD: number,
    gasEstimate: GasEstimate,
    ethPriceUSD: number
  ): { netProfitUSD: number; gasCostUSD: number; isProfitable: boolean } {
    const realisticGasUsage = 400_000n; // production-measured average
    const gasCostWei = realisticGasUsage * gasEstimate.gasPrice;
    const gasCostUSD = (Number(gasCostWei) / 1e18) * ethPriceUSD;
    const netProfitUSD = estimatedProfitUSD - gasCostUSD;

    return {
      netProfitUSD,
      gasCostUSD,
      isProfitable: netProfitUSD > 0,
    };
  }
}

export class CompetitiveSubmitter {
  constructor(private optimizer: DynamicGasOptimizer) {}

  async submitWithRetry(
    contract: ethers.Contract,
    method: string,
    params: any[],
    chainId: number,
    opportunityId: string,
    maxRetries = 3
  ): Promise<string | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const gasParams = await this.optimizer.getOptimalGasParams(
          chainId,
          contract.runner!.provider!,
          opportunityId,
          attempt > 1
        );

        const txOpts: any = { gasLimit: gasParams.gasLimit };

        // EIP-1559 on Polygon/Base, legacy on Arbitrum
        if (chainId === 137 || chainId === 8453) {
          txOpts.maxFeePerGas = gasParams.maxFeePerGas;
          txOpts.maxPriorityFeePerGas = gasParams.maxPriorityFeePerGas;
        } else {
          txOpts.gasPrice = gasParams.gasPrice;
        }

        const tx = await contract[method](...params, txOpts);
        return tx.hash;

      } catch (err: any) {
        this.optimizer.recordFailure(opportunityId, err.message || '');

        if (attempt === maxRetries) {
          logger.error('All retry attempts exhausted', { opportunityId, attempts: maxRetries });
          return null;
        }

        // Exponential backoff: 1s, 2s, 4s...
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
    return null;
  }
}
