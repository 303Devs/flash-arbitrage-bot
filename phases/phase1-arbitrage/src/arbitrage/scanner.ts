/**
 * On-Chain Price Scanner
 *
 * Queries DEX prices every ~1 second using on-chain quoters.
 * Uses parallel RPC calls to minimize latency.
 *
 * Price discovery methods:
 * - Uniswap V3: quoteExactInputSingle (static call on Quoter)
 * - V2-style (SushiSwap, QuickSwap, Camelot, Aerodrome): getReserves() + constant product formula
 *
 * Emits 'quotes' events with fresh price data for the opportunity detector.
 */

import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { getDEXsForChain, TRADING_PAIRS, type DEXConfig } from '../config/dexes.js';
import { MAINNET_TOKENS, type TokenInfo } from '../contracts/token-addresses.js';
import { logger } from '../monitoring/logger.js';

// ---- ABIs ----

const QUOTER_V1_ABI = [
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)',
];

const FACTORY_V2_ABI = [
  'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

const PAIR_V2_ABI = [
  'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() external view returns (address)',
];

// ---- Types ----

export interface DexQuote {
  dexId:     string;
  dexType:   DEXConfig['type'];
  tokenIn:   TokenInfo;
  tokenOut:  TokenInfo;
  amountIn:  bigint;
  amountOut: bigint;
  fee:       number;      // fee tier used (for V3 only)
  router:    string;
  factory?:  string;      // for Aerodrome/Camelot factory address
  latencyMs: number;
}

export interface ScanResult {
  chainId:   number;
  timestamp: number;
  pair:      { tokenA: string; tokenB: string };
  quotes:    DexQuote[];
}

// Standard scan amounts per token type (approximately $10k USD equivalent)
// These are used to quote at realistic flash loan scale
const SCAN_AMOUNTS: Record<string, bigint> = {
  USDC:   10_000n * 10n ** 6n,   // $10,000 USDC
  USDT:   10_000n * 10n ** 6n,   // $10,000 USDT
  DAI:    10_000n * 10n ** 18n,  // $10,000 DAI
  WETH:   5n    * 10n ** 18n,    // 5 ETH (~$10,000)
  WBTC:   15n   * 10n ** 6n,     // 0.15 BTC (~$10,000)
  WMATIC: 15_000n * 10n ** 18n,  // 15,000 MATIC (~$10,000)
  ARB:    10_000n * 10n ** 18n,  // 10,000 ARB
  DEFAULT: 10n ** 18n,           // fallback: 1 unit
};

function getScanAmount(symbol: string): bigint {
  return SCAN_AMOUNTS[symbol.toUpperCase()] ?? SCAN_AMOUNTS.DEFAULT;
}

// ---- V3 quoting ----

async function quoteV3(
  provider: ethers.Provider,
  quoterAddress: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint,
  feeTiers: number[]
): Promise<{ amountOut: bigint; fee: number } | null> {
  const quoter = new ethers.Contract(quoterAddress, QUOTER_V1_ABI, provider);
  let best: { amountOut: bigint; fee: number } | null = null;

  // Try all fee tiers in parallel, pick best output
  const results = await Promise.allSettled(
    feeTiers.map(async (fee) => {
      // V1 quoter mutates state, must use staticCall
      const out = await quoter.quoteExactInputSingle.staticCall(
        tokenIn.address,
        tokenOut.address,
        fee,
        amountIn,
        0n // sqrtPriceLimitX96 = 0 means no price limit
      );
      return { amountOut: BigInt(out.toString()), fee };
    })
  );

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.amountOut > 0n) {
      if (!best || r.value.amountOut > best.amountOut) {
        best = r.value;
      }
    }
  }

  return best;
}

// ---- V2 quoting (constant product formula) ----

async function quoteV2(
  provider: ethers.Provider,
  factoryAddress: string,
  tokenIn: TokenInfo,
  tokenOut: TokenInfo,
  amountIn: bigint
): Promise<bigint | null> {
  try {
    const factory = new ethers.Contract(factoryAddress, FACTORY_V2_ABI, provider);
    const pairAddress = await factory.getPair(tokenIn.address, tokenOut.address);

    if (pairAddress === ethers.ZeroAddress) return null;

    const pair     = new ethers.Contract(pairAddress, PAIR_V2_ABI, provider);
    const [reserves, token0] = await Promise.all([
      pair.getReserves(),
      pair.token0(),
    ]);

    const [reserve0, reserve1] = [BigInt(reserves[0]), BigInt(reserves[1])];
    const isToken0In = token0.toLowerCase() === tokenIn.address.toLowerCase();
    const [reserveIn, reserveOut] = isToken0In
      ? [reserve0, reserve1]
      : [reserve1, reserve0];

    if (reserveIn === 0n || reserveOut === 0n) return null;

    // Constant product: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    const amountInWithFee = amountIn * 997n;
    const amountOut = (amountInWithFee * reserveOut) / (reserveIn * 1000n + amountInWithFee);

    return amountOut > 0n ? amountOut : null;
  } catch {
    return null;
  }
}

// ---- Main Scanner ----

export class PriceScanner extends EventEmitter {
  private intervals = new Map<number, NodeJS.Timeout>();
  private running   = false;

  constructor(
    private providers: Map<number, ethers.Provider>,
    private scanIntervalMs = 1000
  ) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const [chainId, provider] of this.providers) {
      const tokens = MAINNET_TOKENS[chainId];
      if (!tokens) { logger.warn(`No tokens for chain ${chainId}`); continue; }

      const dexs   = getDEXsForChain(chainId);
      const pairs  = this.getPairsForChain(chainId, tokens);

      logger.info(`📡 Scanner started`, {
        chain: chainId,
        dexs:  dexs.length,
        pairs: pairs.length,
        intervalMs: this.scanIntervalMs,
      });

      const tick = async () => {
        if (!this.running) return;
        await this.scanChain(chainId, provider, tokens, dexs, pairs);
      };

      // Run immediately, then on interval
      tick();
      const handle = setInterval(tick, this.scanIntervalMs);
      this.intervals.set(chainId, handle);
    }
  }

  stop(): void {
    this.running = false;
    for (const handle of this.intervals.values()) clearInterval(handle);
    this.intervals.clear();
    logger.info('📡 Scanner stopped');
  }

  private getPairsForChain(
    chainId: number,
    tokens: Record<string, TokenInfo>
  ): Array<{ tokenA: TokenInfo; tokenB: TokenInfo }> {
    return TRADING_PAIRS
      .filter(p => !p.chains || p.chains.includes(chainId))
      .map(p => {
        const tokenA = tokens[p.tokenA];
        const tokenB = tokens[p.tokenB];
        return tokenA && tokenB ? { tokenA, tokenB } : null;
      })
      .filter((p): p is { tokenA: TokenInfo; tokenB: TokenInfo } => p !== null);
  }

  private async scanChain(
    chainId:  number,
    provider: ethers.Provider,
    tokens:   Record<string, TokenInfo>,
    dexs:     DEXConfig[],
    pairs:    Array<{ tokenA: TokenInfo; tokenB: TokenInfo }>
  ): Promise<void> {
    // Run all pair scans in parallel
    const scanPromises = pairs.map(({ tokenA, tokenB }) =>
      this.scanPair(chainId, provider, tokenA, tokenB, dexs)
    );

    const results = await Promise.allSettled(scanPromises);

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.quotes.length >= 2) {
        this.emit('scanResult', r.value);
      }
    }
  }

  private async scanPair(
    chainId:  number,
    provider: ethers.Provider,
    tokenIn:  TokenInfo,
    tokenOut: TokenInfo,
    dexs:     DEXConfig[]
  ): Promise<ScanResult | null> {
    const amountIn  = getScanAmount(tokenIn.symbol);
    const t0        = Date.now();
    const quotes: DexQuote[] = [];

    // Query all DEXs in parallel
    const dexPromises = dexs.map(async (dex) => {
      const contracts = dex.contracts[chainId];
      if (!contracts) return;

      const router = contracts.router ?? contracts.vault;
      if (!router) return;

      try {
        if (dex.type === 'uniswap-v3' && contracts.quoter) {
          const result = await quoteV3(
            provider,
            contracts.quoter,
            tokenIn,
            tokenOut,
            amountIn,
            dex.fees
          );
          if (result) {
            quotes.push({
              dexId:    dex.id,
              dexType:  dex.type,
              tokenIn,
              tokenOut,
              amountIn,
              amountOut: result.amountOut,
              fee:       result.fee,
              router,
              latencyMs: Date.now() - t0,
            });
          }
        } else if ((dex.type === 'uniswap-v2' || dex.type === 'custom') && contracts.factory) {
          const amountOut = await quoteV2(
            provider,
            contracts.factory,
            tokenIn,
            tokenOut,
            amountIn
          );
          if (amountOut) {
            quotes.push({
              dexId:    dex.id,
              dexType:  dex.type,
              tokenIn,
              tokenOut,
              amountIn,
              amountOut,
              fee:      dex.fees[0] ?? 3000,
              router,
              factory:  contracts.factory,
              latencyMs: Date.now() - t0,
            });
          }
        }
        // Skip Balancer and Curve as price sources (complex math, focus on V2/V3)
      } catch {
        // Silent - individual DEX failures are expected (pool may not exist for this pair)
      }
    });

    await Promise.allSettled(dexPromises);

    if (quotes.length === 0) return null;

    return {
      chainId,
      timestamp: Date.now(),
      pair: { tokenA: tokenIn.symbol, tokenB: tokenOut.symbol },
      quotes,
    };
  }
}
