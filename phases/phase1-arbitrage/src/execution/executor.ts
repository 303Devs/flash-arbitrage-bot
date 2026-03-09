/**
 * Enterprise Arbitrage Executor
 * Orchestrates flash loan arbitrage execution across multiple chains
 *
 * Features:
 * - Per-chain contract management
 * - Circuit breaker (auto-pause on repeated failures)
 * - Nonce management (prevents "replacement fee too low" errors)
 * - Real-time metrics
 * - Duplicate execution prevention
 */

import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import {
  ProfitCalculatorService,
  NonceManagerService,
  CircuitBreakerService,
  TransactionManagerService,
  MetricsService,
  ArbitrageOpportunity,
  TokenInfo,
} from './services.js';
import { validateOpportunity, executeArbitrageFixed } from './decimal-fix.js';
import { logger } from '../monitoring/logger.js';

// DEX router addresses per chain (for mapping DEX name → address)
export const DEX_ROUTERS: Record<number, Record<string, string>> = {
  42161: { // Arbitrum
    'uniswap-v3': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    'uniswap-v2': '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    'sushiswap':  '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    'camelot':    '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
    'balancer':   '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    'curve':      '0x7544Fe977a8546c47cA37878CfcB8CF27B70C0D0',
  },
  137: { // Polygon
    'uniswap-v3': '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    'sushiswap':  '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
    'quickswap':  '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    'balancer':   '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    'curve':      '0x47bB542B9dE58b970bA50c9dae444DDB4c16751a',
  },
  8453: { // Base
    'uniswap-v3': '0x2626664c2603336E57B271c5C0b26F421741e481',
    'aerodrome':  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    'balancer':   '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    'curve':      '0xf3A6aa40cf048a3960E9664847E9a7be025a390a',
  },
};

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

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  profit?: number;
  gasCost?: number;
  latencyMs: number;
  failureReason?: string;
}

export class EnterpriseArbitrageExecutor extends EventEmitter {
  private contracts  = new Map<number, ethers.Contract>();
  private wallet:    ethers.Wallet;

  // Service layer
  private profitCalc     = new ProfitCalculatorService();
  private nonceManager:    NonceManagerService;
  private circuitBreaker = new CircuitBreakerService();
  private txManager:       TransactionManagerService;
  private metrics        = new MetricsService();

  private activeExecutions = new Map<string, Promise<ExecutionResult>>();

  constructor(
    private providers: Map<number, ethers.Provider>,
    private contractAddresses: Map<number, string>,
    privateKey: string,
    redisUrl?: string
  ) {
    super();
    this.wallet       = new ethers.Wallet(privateKey);
    this.nonceManager = new NonceManagerService(redisUrl);
    this.txManager    = new TransactionManagerService(providers);

    this.initContracts();
    this.setupListeners();
    this.startHealthCheck();
  }

  async initialize(): Promise<void> {
    logger.info('🚀 Initializing arbitrage executor...');

    for (const [chainId, provider] of this.providers) {
      await this.nonceManager.initializeNonce(chainId, provider, this.wallet.address);
      const addr = this.contractAddresses.get(chainId);
      logger.info(`✅ Chain ${chainId} ready`, { contractAddress: addr, wallet: this.wallet.address });
    }

    logger.info('✅ Executor ready');
  }

  async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    const startTime   = Date.now();
    const executionId = `${opportunity.chainId}-${opportunity.id}`;

    // Validate opportunity (decimal precision, staleness, profit floor)
    const validation = validateOpportunity({
      id:             opportunity.id,
      timestamp:      opportunity.timestamp,
      expectedProfit: opportunity.expectedProfit,
      chainId:        opportunity.chainId,
    });

    if (!validation.valid) {
      return { success: false, latencyMs: Date.now() - startTime, failureReason: validation.reason };
    }

    // Circuit breaker
    if (!this.circuitBreaker.canExecute(opportunity.chainId)) {
      return { success: false, latencyMs: Date.now() - startTime, failureReason: 'Circuit breaker active' };
    }

    // Prevent duplicate executions
    if (this.activeExecutions.has(executionId)) {
      return { success: false, latencyMs: Date.now() - startTime, failureReason: 'Already in progress' };
    }

    const promise = this.run(opportunity, startTime);
    this.activeExecutions.set(executionId, promise);
    try {
      return await promise;
    } finally {
      this.activeExecutions.delete(executionId);
    }
  }

  private async run(opportunity: ArbitrageOpportunity, startTime: number): Promise<ExecutionResult> {
    const { chainId } = opportunity;

    try {
      const contract = this.contracts.get(chainId);
      const provider = this.providers.get(chainId);
      if (!contract || !provider) throw new Error(`No contract/provider for chain ${chainId}`);

      // Map opportunity to the format executeArbitrageFixed expects
      const formatted = {
        id:             opportunity.id,
        chainId:        opportunity.chainId,
        tokenA:         { address: opportunity.tokenA },
        tokenB:         { address: opportunity.tokenB },
        dexA:           { router: DEX_ROUTERS[chainId]?.[opportunity.buyDex]  || '' },
        dexB:           { router: DEX_ROUTERS[chainId]?.[opportunity.sellDex] || '' },
        optimalAmount:  parseFloat(opportunity.amountIn) || 1000,
        estimatedProfit: opportunity.expectedProfit,
        timestamp:      opportunity.timestamp,
      };

      const result = await executeArbitrageFixed(formatted, contract, provider);

      if (result.success) {
        this.circuitBreaker.recordSuccess(chainId);
        this.metrics.recordExecution(true, opportunity.expectedProfit, 0, Date.now() - startTime);

        logger.info('🎉 ARBITRAGE SUCCESS!', {
          txHash:  result.hash,
          gasUsed: result.gasUsed?.toString(),
          profit:  `$${opportunity.expectedProfit.toFixed(2)}`,
          latency: `${Date.now() - startTime}ms`,
        });

        return { success: true, txHash: result.hash, profit: opportunity.expectedProfit, latencyMs: Date.now() - startTime };
      } else {
        this.circuitBreaker.recordFailure(chainId);
        this.metrics.recordFailure(result.error || 'Unknown');
        return { success: false, latencyMs: Date.now() - startTime, failureReason: result.error };
      }

    } catch (err: any) {
      this.circuitBreaker.recordFailure(chainId);
      this.metrics.recordFailure(err.message || 'Unknown');

      logger.error('💥 Execution failed', {
        id: opportunity.id, error: err.message, chainId,
        contract: this.contractAddresses.get(chainId),
      });

      return { success: false, latencyMs: Date.now() - startTime, failureReason: err.reason || err.message };
    }
  }

  private initContracts(): void {
    for (const [chainId, provider] of this.providers) {
      const addr = this.contractAddresses.get(chainId);
      if (!addr) { logger.error(`No contract address for chain ${chainId}`); continue; }

      const connected = this.wallet.connect(provider);
      this.contracts.set(chainId, new ethers.Contract(addr, CONTRACT_ABI, connected));
      logger.info(`Contract initialized`, { chainId, address: addr });
    }
  }

  private setupListeners(): void {
    this.circuitBreaker.on('cooldownEntered', (data) => {
      logger.circuitBreaker(true, 'Too many failures', data.durationMs / 60000);
      this.emit('circuitBreakerTriggered', data);
    });

    this.txManager.on('transactionSpedUp', (data) => {
      logger.info('⚡ Tx speed-up attempted', data);
    });
  }

  private startHealthCheck(): void {
    setInterval(() => {
      const m  = this.metrics.getMetrics();
      const cb = this.circuitBreaker.getStatus();

      logger.info('📊 Executor health', {
        active:      this.activeExecutions.size,
        successRate: `${(m.successRate * 100).toFixed(1)}%`,
        netProfit:   `$${m.netProfitUSD.toFixed(2)}`,
        avgLatency:  `${m.avgLatencyMs.toFixed(0)}ms`,
        inCooldown:  cb.inCooldown,
      });

      this.emit('healthReport', { metrics: m, circuitBreaker: cb });
    }, 30_000);
  }

  async emergencyStop(): Promise<void> {
    logger.warn('🛑 Emergency stop initiated');
    this.circuitBreaker.isActive = false;

    const deadline = Date.now() + 60_000;
    while (this.activeExecutions.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1000));
    }

    logger.info(`Emergency stop complete (${this.activeExecutions.size} may still be active)`);
  }

  async isAuthorized(chainId: number): Promise<boolean> {
    try {
      const c = this.contracts.get(chainId);
      return c ? await c.isAuthorizedExecutor(this.wallet.address) : false;
    } catch { return false; }
  }

  getMetrics() { return this.metrics.getMetrics(); }
  getCircuitBreakerStatus() { return this.circuitBreaker.getStatus(); }
}

export default EnterpriseArbitrageExecutor;
