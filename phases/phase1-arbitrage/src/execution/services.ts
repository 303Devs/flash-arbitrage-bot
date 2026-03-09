/**
 * Execution service layer
 * Handles profit calculation, nonce management, circuit breaking, tx monitoring, metrics
 */

import { ethers } from 'ethers';
import { EventEmitter } from 'events';

// Redis is optional - gracefully degrade if not available
let Redis: any = null;
try {
  Redis = (await import('ioredis')).default;
} catch {
  console.warn('⚠️  Redis not available - using in-memory nonce management only');
}

// ============================================================
// INTERFACES
// ============================================================

export interface ArbitrageOpportunity {
  id: string;
  chainId: number;
  tokenA: string;   // address
  tokenB: string;   // address
  amountIn: string; // token amount (raw)
  expectedProfit: number; // USD
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  gasLimit?: number;
  timestamp: number;
}

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
}

// ============================================================
// PROFIT CALCULATOR
// ============================================================

export class ProfitCalculatorService {
  private priceCache = new Map<string, { price: number; ts: number }>();
  private readonly CACHE_TTL = 30_000;

  async calculateProfit(
    opportunity: ArbitrageOpportunity,
    gasEstimate: bigint,
    provider: ethers.Provider,
    tokenInfo: TokenInfo
  ): Promise<{
    grossProfitUSD: number;
    gasCostUSD: number;
    netProfitUSD: number;
    gasEstimate: bigint;
    effectiveGasPrice: bigint;
    isProfitable: boolean;
    confidence: number;
  }> {
    const block    = await provider.getBlock('latest');
    const baseFee  = block?.baseFeePerGas ?? 0n;
    const feeData  = await provider.getFeeData();
    const effectiveGasPrice = baseFee + (feeData.maxPriorityFeePerGas ?? 0n);

    const gasCostWei = gasEstimate * effectiveGasPrice;
    const ethPrice   = await this.getPrice('ethereum');
    const gasCostUSD = parseFloat(ethers.formatEther(gasCostWei)) * ethPrice;

    const tokenPrice   = await this.getPrice(tokenInfo.symbol.toLowerCase());
    const grossProfitUSD = opportunity.expectedProfit * tokenPrice;
    const netProfitUSD   = grossProfitUSD - gasCostUSD;

    return {
      grossProfitUSD,
      gasCostUSD,
      netProfitUSD,
      gasEstimate,
      effectiveGasPrice,
      isProfitable: netProfitUSD > 0,
      confidence: this.confidence(opportunity, gasCostUSD),
    };
  }

  private confidence(opp: ArbitrageOpportunity, gasCostUSD: number): number {
    const ratio    = opp.expectedProfit / Math.max(gasCostUSD, 0.01);
    const decay    = Math.max(0, 1 - (Date.now() - opp.timestamp) / 30_000);
    const spread   = Math.min(1, ((opp.sellPrice - opp.buyPrice) / opp.buyPrice) * 100);
    return Math.min(1, ratio * 0.4 + decay * 0.3 + spread * 0.3);
  }

  private async getPrice(symbol: string): Promise<number> {
    const cached = this.priceCache.get(symbol);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) return cached.price;
    // TODO: Implement multi-source price fetching (CoinGecko, Chainlink, etc.)
    const price = 1; // placeholder
    this.priceCache.set(symbol, { price, ts: Date.now() });
    return price;
  }
}

// ============================================================
// NONCE MANAGER
// ============================================================

interface NonceState {
  current: number;
  pending: Map<number, { txHash?: string; timestamp: number; retries: number }>;
  stuck: Set<number>;
}

export class NonceManagerService {
  private redis: any = null;
  private states = new Map<number, NonceState>();
  private readonly STUCK_TIMEOUT = 180_000; // 3 min
  private readonly MAX_RETRIES   = 3;

  constructor(redisUrl?: string) {
    if (Redis && redisUrl) {
      try {
        this.redis = new Redis(redisUrl);
        console.log('✅ Redis connected for nonce persistence');
      } catch (err: any) {
        console.warn('⚠️  Redis connect failed - in-memory only:', err.message);
      }
    }
  }

  async initializeNonce(chainId: number, provider: ethers.Provider, wallet: string): Promise<void> {
    let stored: any = {};
    if (this.redis) {
      try { stored = await this.redis.hgetall(`nonce:${chainId}:${wallet}`); } catch { /* noop */ }
    }

    const providerNonce = await provider.getTransactionCount(wallet, 'pending');
    this.states.set(chainId, {
      current: Math.max(providerNonce, parseInt(stored.current) || 0),
      pending: new Map(),
      stuck:   new Set(),
    });
  }

  async getNextNonce(chainId: number, wallet: string): Promise<number> {
    const state = this.states.get(chainId);
    if (!state) throw new Error(`Nonce not initialized for chain ${chainId}`);

    this.cleanStuck(state);

    let nonce = state.current;
    while (state.pending.has(nonce) || state.stuck.has(nonce)) nonce++;

    state.pending.set(nonce, { timestamp: Date.now(), retries: 0 });
    if (nonce >= state.current) state.current = nonce + 1;

    await this.persist(chainId, wallet, state);
    return nonce;
  }

  async releaseNonce(chainId: number, nonce: number, wallet: string, success = true): Promise<void> {
    const state = this.states.get(chainId);
    if (!state) return;

    if (success) {
      state.pending.delete(nonce);
    } else {
      const data = state.pending.get(nonce);
      if (data) {
        data.retries++;
        if (data.retries >= this.MAX_RETRIES) {
          state.pending.delete(nonce);
          state.stuck.add(nonce);
        }
      }
    }

    await this.persist(chainId, wallet, state);
  }

  private cleanStuck(state: NonceState): void {
    const now = Date.now();
    for (const [nonce, data] of state.pending) {
      if (now - data.timestamp > this.STUCK_TIMEOUT) {
        state.pending.delete(nonce);
        state.stuck.add(nonce);
      }
    }
  }

  private async persist(chainId: number, wallet: string, state: NonceState): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.hmset(`nonce:${chainId}:${wallet}`, {
        current: state.current.toString(),
        pending: JSON.stringify(Object.fromEntries(state.pending)),
        stuck:   JSON.stringify(Array.from(state.stuck)),
      });
      await this.redis.expire(`nonce:${chainId}:${wallet}`, 86400);
    } catch { /* noop */ }
  }
}

// ============================================================
// CIRCUIT BREAKER
// ============================================================

export class CircuitBreakerService extends EventEmitter {
  private failures = new Map<number, { count: number; windowStart: number }>();
  private readonly WINDOW_MS    = 300_000;  // 5 min
  private readonly MAX_FAILURES = 10;
  private readonly COOLDOWN_MS  = 600_000;  // 10 min

  private cooldownUntil = 0;
  isActive = true;

  canExecute(chainId: number): boolean {
    if (!this.isActive || Date.now() < this.cooldownUntil) return false;

    const f = this.failures.get(chainId);
    if (f && this.isExceeded(f)) {
      this.enterCooldown();
      return false;
    }
    return true;
  }

  recordFailure(chainId: number): void {
    const now  = Date.now();
    const curr = this.failures.get(chainId) || { count: 0, windowStart: now };

    if (now - curr.windowStart > this.WINDOW_MS) {
      curr.count = 1; curr.windowStart = now;
    } else {
      curr.count++;
    }

    this.failures.set(chainId, curr);
    if (this.isExceeded(curr)) this.enterCooldown();
  }

  recordSuccess(chainId: number): void {
    const f = this.failures.get(chainId);
    if (f && f.count > 0) f.count--;
  }

  private isExceeded(f: { count: number }): boolean {
    return f.count >= this.MAX_FAILURES;
  }

  private enterCooldown(): void {
    this.cooldownUntil = Date.now() + this.COOLDOWN_MS;
    this.emit('cooldownEntered', { durationMs: this.COOLDOWN_MS });
  }

  getStatus() {
    return {
      isActive:   this.isActive,
      inCooldown: Date.now() < this.cooldownUntil,
      cooldownUntil: this.cooldownUntil,
      failures:   Object.fromEntries(this.failures),
    };
  }
}

// ============================================================
// TRANSACTION MANAGER
// ============================================================

export class TransactionManagerService extends EventEmitter {
  private pending = new Map<string, { tx: ethers.TransactionResponse; submittedAt: number; speedUps: number; chainId: number }>();
  private readonly SPEEDUP_AFTER_BLOCKS = 3;
  private readonly MAX_SPEEDUPS = 2;

  constructor(private providers: Map<number, ethers.Provider>) {
    super();
    setInterval(() => this.checkPending(), 10_000);
  }

  track(tx: ethers.TransactionResponse, chainId: number): void {
    this.pending.set(tx.hash, { tx, submittedAt: Date.now(), speedUps: 0, chainId });
  }

  private async checkPending(): Promise<void> {
    for (const [hash, data] of this.pending) {
      try {
        const provider = this.providers.get(data.chainId);
        if (!provider) continue;

        const receipt = await provider.getTransactionReceipt(hash);
        if (receipt) {
          this.pending.delete(hash);
          this.emit('mined', { hash, success: receipt.status === 1 });
          continue;
        }

        const current = await provider.getBlockNumber();
        const txBlock = data.tx.blockNumber || current;
        const behind  = current - txBlock;

        if (behind >= this.SPEEDUP_AFTER_BLOCKS && data.speedUps < this.MAX_SPEEDUPS) {
          data.speedUps++;
          this.emit('transactionSpedUp', { hash, attempt: data.speedUps });
        }

        if (behind > 10) {
          this.pending.delete(hash);
          this.emit('orphaned', { hash });
        }
      } catch { /* noop */ }
    }
  }
}

// ============================================================
// METRICS
// ============================================================

export class MetricsService {
  private data = {
    attempted:    0,
    successful:   0,
    totalProfitUSD: 0,
    totalGasCostUSD: 0,
    avgLatencyMs:   0,
    failureReasons: new Map<string, number>(),
  };

  recordExecution(success: boolean, profitUSD: number, gasCostUSD: number, latencyMs: number): void {
    this.data.attempted++;
    if (success) { this.data.successful++; this.data.totalProfitUSD += profitUSD; }
    this.data.totalGasCostUSD += gasCostUSD;
    this.data.avgLatencyMs = this.data.avgLatencyMs * 0.9 + latencyMs * 0.1;
  }

  recordFailure(reason: string): void {
    this.data.failureReasons.set(reason, (this.data.failureReasons.get(reason) || 0) + 1);
  }

  getMetrics() {
    return {
      ...this.data,
      successRate:   this.data.attempted > 0 ? this.data.successful / this.data.attempted : 0,
      netProfitUSD:  this.data.totalProfitUSD - this.data.totalGasCostUSD,
      failureReasons: Object.fromEntries(this.data.failureReasons),
    };
  }
}
