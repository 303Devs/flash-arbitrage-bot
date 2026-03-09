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
 * - Competitive gas pricing
 */

import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import {
  ProfitCalculatorService,
  NonceManagerService,
  CircuitBreakerService,
  TransactionManagerService,
  MetricsService,
  type ArbitrageOpportunity,
} from './services.js';
import { validateOpportunity } from './decimal-fix.js';
import { buildSwapCalldata, withSlippage, type SwapParams } from '../utils/calldata-builder.js';
import { DynamicGasOptimizer } from '../utils/gas-optimizer.js';
import { logger } from '../monitoring/logger.js';

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
  success:       boolean;
  txHash?:       string;
  profit?:       number;
  gasCostUSD?:   number;
  latencyMs:     number;
  failureReason?: string;
}

export class EnterpriseArbitrageExecutor extends EventEmitter {
  private contracts    = new Map<number, ethers.Contract>();
  private wallet:      ethers.Wallet;
  private gasOptimizer = new DynamicGasOptimizer();

  // Service layer
  private profitCalc     = new ProfitCalculatorService();
  private nonceManager:    NonceManagerService;
  private circuitBreaker = new CircuitBreakerService();
  private txManager:       TransactionManagerService;
  private metrics        = new MetricsService();

  private activeExecutions = new Map<string, Promise<ExecutionResult>>();

  constructor(
    private providers:         Map<number, ethers.Provider>,
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

    // Validate opportunity (staleness, profit floor, decimal sanity)
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

    // Prevent duplicate executions of the same opportunity
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

      const contractAddress = this.contractAddresses.get(chainId)!;
      const flashAmount     = BigInt(opportunity.amountIn);
      const minProfit       = BigInt(opportunity.minProfitWei);

      // Build swap calldata - the most important step.
      // These are the exact ABI-encoded function calls the contract will execute.
      const buyParams: SwapParams = {
        tokenIn:          opportunity.tokenA,
        tokenOut:         opportunity.tokenB,
        amountIn:         flashAmount,
        amountOutMinimum: 0n, // No slippage protection in sim - profit check happens on-chain
        recipient:        contractAddress,
        fee:              opportunity.buyFee,
        stable:           false,
        factory:          opportunity.buyDexFactory,
      };

      // For the sell leg, amountIn = expected tokenB output from the buy leg.
      // We use withSlippage(0.5%) so minor price movement doesn't cause reverts.
      const expectedBuyOutput = BigInt(opportunity.buyAmountOut);
      const sellParams: SwapParams = {
        tokenIn:          opportunity.tokenB,
        tokenOut:         opportunity.tokenA,
        amountIn:         withSlippage(expectedBuyOutput, 50), // 99.5% of expected (0.5% slippage)
        amountOutMinimum: flashAmount + minProfit, // Must return at least flash amount + min profit
        recipient:        contractAddress,
        fee:              opportunity.sellFee,
        stable:           false,
        factory:          opportunity.sellDexFactory,
      };

      const swapDataA = buildSwapCalldata(
        opportunity.buyDexType,
        opportunity.buyDex,
        buyParams,
        { factory: opportunity.buyDexFactory }
      );

      const swapDataB = buildSwapCalldata(
        opportunity.sellDexType,
        opportunity.sellDex,
        sellParams,
        { factory: opportunity.sellDexFactory }
      );

      // Build the params struct for the contract
      const params = {
        provider:       0, // 0 = BALANCER (free flash loans preferred)
        tokenIn:        opportunity.tokenA,
        tokenOut:       opportunity.tokenB,
        flashAmount,
        minProfit,
        dexA:           opportunity.buyDexRouter,
        dexB:           opportunity.sellDexRouter,
        swapDataA,
        swapDataB,
        executor:       this.wallet.address,
        preFlashBalance: 0n, // Contract captures this on-chain
      };

      // Get competitive gas pricing
      const gasParams = await this.gasOptimizer.getOptimalGasParams(chainId, provider, opportunity.id);

      const txOpts: Record<string, unknown> = { gasLimit: gasParams.gasLimit };
      if (chainId === 137 || chainId === 8453) {
        txOpts.maxFeePerGas         = gasParams.maxFeePerGas;
        txOpts.maxPriorityFeePerGas = gasParams.maxPriorityFeePerGas;
      } else {
        txOpts.gasPrice = gasParams.gasPrice;
      }

      const connectedContract = contract.connect(this.wallet.connect(provider)) as ethers.Contract;
      const tx = await (connectedContract as any).executeArbitrage(params, txOpts);
      const receipt = await tx.wait();

      if (receipt.status === 1) {
        this.circuitBreaker.recordSuccess(chainId);
        this.metrics.recordExecution(true, opportunity.expectedProfit, opportunity.gasCostUSD, Date.now() - startTime);

        logger.info('🎉 ARBITRAGE SUCCESS!', {
          txHash:    tx.hash,
          gasUsed:   receipt.gasUsed.toString(),
          pair:      `${opportunity.tokenASymbol}/${opportunity.tokenBSymbol}`,
          buyDex:    opportunity.buyDex,
          sellDex:   opportunity.sellDex,
          profit:    `$${opportunity.expectedProfit.toFixed(2)}`,
          latency:   `${Date.now() - startTime}ms`,
        });

        this.emit('arbitrageExecuted', { opportunity, txHash: tx.hash, profit: opportunity.expectedProfit });
        return { success: true, txHash: tx.hash, profit: opportunity.expectedProfit, latencyMs: Date.now() - startTime };

      } else {
        this.circuitBreaker.recordFailure(chainId);
        this.metrics.recordFailure('Transaction reverted');
        return { success: false, latencyMs: Date.now() - startTime, failureReason: 'Transaction reverted' };
      }

    } catch (err: any) {
      this.circuitBreaker.recordFailure(chainId);

      const reason = err.reason || err.data?.message || err.message || 'Unknown error';
      this.metrics.recordFailure(reason);
      this.gasOptimizer.recordFailure(opportunity.id, reason);

      logger.error('💥 Execution failed', {
        id:       opportunity.id,
        pair:     `${opportunity.tokenASymbol}/${opportunity.tokenBSymbol}`,
        error:    reason,
        chainId,
        contract: this.contractAddresses.get(chainId),
      });

      return { success: false, latencyMs: Date.now() - startTime, failureReason: reason };
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
      return c ? await (c as any).isAuthorizedExecutor(this.wallet.address) : false;
    } catch { return false; }
  }

  getMetrics()              { return this.metrics.getMetrics(); }
  getCircuitBreakerStatus() { return this.circuitBreaker.getStatus(); }
}

export default EnterpriseArbitrageExecutor;
