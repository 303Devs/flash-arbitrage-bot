/**
 * Arbitrage Opportunity Detector
 *
 * Analyzes price quotes from the scanner and finds profitable arbitrage.
 *
 * Logic:
 * 1. For each pair of DEXs (A, B) on a scan result:
 *    - Check forward: buy on A (better amountOut), sell on B
 *    - Check reverse: buy on B, sell on A
 * 2. Calculate expected profit:
 *    grossProfit = amountOut(sellDex) - amountIn (in token units)
 *    gasCostToken = gasCostUSD / tokenPriceUSD
 *    netProfitUSD = (grossProfit - gasCostToken) * tokenPriceUSD
 * 3. Filter by minimum profit thresholds
 * 4. Return sorted by net profit descending
 */

import { ethers } from 'ethers';
import { type DexQuote, type ScanResult } from './scanner.js';
import { type ArbitrageOpportunity } from '../execution/services.js';
import { normalizeAmount, denormalizeAmount } from '../contracts/token-addresses.js';
import { logger } from '../monitoring/logger.js';

// Minimum net profit after gas (USD)
const MIN_PROFIT_USD: Record<number, number> = {
  42161: 3,   // Arbitrum: $3 min (gas ~$0.25)
  137:   1,   // Polygon: $1 min (gas ~$0.40)
  8453:  2,   // Base: $2 min (gas ~$0.12)
};

// Approximate gas cost in USD per arbitrage tx
// (flash loan + 2 DEX swaps + overhead)
const GAS_COST_USD: Record<number, number> = {
  42161: 0.30,  // Arbitrum: ~300k gas @ 0.1 gwei + ETH=$2500
  137:   0.50,  // Polygon: ~300k gas @ 30 gwei + MATIC=$0.50
  8453:  0.15,  // Base: ~300k gas @ 0.05 gwei + ETH=$2500
};

// Approximate token prices in USD (updated by the scanner via ETH oracle)
// These defaults are used when no oracle data is available
const FALLBACK_PRICES_USD: Record<string, number> = {
  USDC:   1.0,
  USDT:   1.0,
  DAI:    1.0,
  WETH:   2500,
  WBTC:   65000,
  WMATIC: 0.50,
  ARB:    1.0,
  LINK:   15,
  BAL:    3,
  CRV:    0.5,
};

let idCounter = 0;

function nextId(): string {
  return `arb-${Date.now()}-${(++idCounter).toString().padStart(4, '0')}`;
}

/**
 * Convert a token amount (in native units) to USD
 */
function tokenToUSD(amount: bigint, decimals: number, symbol: string): number {
  const price = FALLBACK_PRICES_USD[symbol.toUpperCase()] ?? 1;
  const normalized = Number(normalizeAmount(amount, decimals)) / 1e18;
  return normalized * price;
}

/**
 * Convert USD to token units (native decimals)
 */
function usdToToken(usd: number, decimals: number, symbol: string): bigint {
  const price = FALLBACK_PRICES_USD[symbol.toUpperCase()] ?? 1;
  const normalized = BigInt(Math.floor((usd / price) * 1e18));
  return denormalizeAmount(normalized, decimals);
}

/**
 * Find the best arbitrage opportunity between two specific DEX quotes.
 * Returns null if not profitable.
 */
function checkArbitrage(
  buyQuote:  DexQuote, // DEX where we buy tokenOut with tokenIn
  sellQuote: DexQuote, // DEX where we sell tokenOut back for tokenIn
  chainId:   number,
): ArbitrageOpportunity | null {
  // Both quotes must use the same amountIn and same pair
  if (buyQuote.amountIn !== sellQuote.amountIn) return null;

  // We buy tokenOut on buyDex: amountIn tokenIn → buyQuote.amountOut tokenOut
  // We sell tokenOut on sellDex: sellQuote.amountIn tokenOut → sellQuote.amountOut tokenIn
  // But for the sell leg: we use buyQuote.amountOut as input
  // We need to recompute what we'd get selling buyQuote.amountOut on sellDex

  // Simplified model: compare rates
  // buyRate = amountOut / amountIn (tokenOut per tokenIn)
  // sellRate = amountOut / amountIn (tokenIn per tokenOut)
  // Profit if: buyRate * sellRate > 1 (after fees)

  const buyAmountIn  = buyQuote.amountIn;    // e.g., 5 WETH (in wei)
  const buyAmountOut = buyQuote.amountOut;   // e.g., 12500 USDC (in 6-dec units)

  // Normalize to 18 decimals for comparison
  const buyIn18  = normalizeAmount(buyAmountIn,  buyQuote.tokenIn.decimals);
  const buyOut18 = normalizeAmount(buyAmountOut, buyQuote.tokenOut.decimals);

  const sellIn18  = normalizeAmount(sellQuote.amountIn,  sellQuote.tokenIn.decimals);
  const sellOut18 = normalizeAmount(sellQuote.amountOut, sellQuote.tokenOut.decimals);

  if (buyIn18 === 0n || sellIn18 === 0n) return null;

  // sellQuote shows: X tokenOut → Y tokenIn
  // We have buyOut tokenOut, scale proportionally
  // scaledSellOut = sellOut18 * buyOut18 / sellIn18
  const scaledSellOut18 = (sellOut18 * buyOut18) / sellIn18;

  // Gross profit in tokenIn (18-dec normalized)
  const grossProfit18 = scaledSellOut18 > buyIn18 ? scaledSellOut18 - buyIn18 : 0n;
  if (grossProfit18 === 0n) return null;

  // Convert to USD
  const grossProfitUSD = tokenToUSD(
    denormalizeAmount(grossProfit18, buyQuote.tokenIn.decimals),
    buyQuote.tokenIn.decimals,
    buyQuote.tokenIn.symbol
  );

  const gasCostUSD = GAS_COST_USD[chainId] ?? 0.50;
  const netProfitUSD = grossProfitUSD - gasCostUSD;

  const minProfit = MIN_PROFIT_USD[chainId] ?? 2;
  if (netProfitUSD < minProfit) return null;

  // Flash loan amount: the amountIn we need to borrow
  const flashAmount = ethers.formatUnits(buyAmountIn, buyQuote.tokenIn.decimals);

  // minProfit in token units ($1 worth of tokenIn)
  const minProfitToken = usdToToken(1, buyQuote.tokenIn.decimals, buyQuote.tokenIn.symbol);

  logger.info(`💡 Opportunity found`, {
    pair:         `${buyQuote.tokenIn.symbol}/${buyQuote.tokenOut.symbol}`,
    buyDex:       buyQuote.dexId,
    sellDex:      sellQuote.dexId,
    grossProfit:  `$${grossProfitUSD.toFixed(4)}`,
    gasCost:      `$${gasCostUSD.toFixed(4)}`,
    netProfit:    `$${netProfitUSD.toFixed(4)}`,
    flashAmount:  flashAmount,
    chainId,
  });

  return {
    id:             nextId(),
    chainId,
    tokenA:         buyQuote.tokenIn.address,
    tokenB:         buyQuote.tokenOut.address,
    tokenASymbol:   buyQuote.tokenIn.symbol,
    tokenBSymbol:   buyQuote.tokenOut.symbol,
    tokenADecimals: buyQuote.tokenIn.decimals,
    tokenBDecimals: buyQuote.tokenOut.decimals,
    amountIn:       buyAmountIn.toString(),
    buyAmountOut:   buyAmountOut.toString(),
    minProfitWei:   minProfitToken.toString(),
    expectedProfit: netProfitUSD,
    grossProfitUSD,
    gasCostUSD,
    buyDex:         buyQuote.dexId,
    sellDex:        sellQuote.dexId,
    buyDexType:     buyQuote.dexType,
    sellDexType:    sellQuote.dexType,
    buyDexRouter:   buyQuote.router,
    sellDexRouter:  sellQuote.router,
    buyFee:         buyQuote.fee,
    sellFee:        sellQuote.fee,
    buyDexFactory:  buyQuote.factory,
    sellDexFactory: sellQuote.factory,
    buyPrice:       Number(buyOut18) / Number(buyIn18),
    sellPrice:      Number(sellOut18) / Number(sellIn18),
    timestamp:      Date.now(),
  };
}

/**
 * Find all profitable arbitrage opportunities in a scan result.
 * Checks every DEX pair combination in both directions.
 */
export function detectOpportunities(scan: ScanResult): ArbitrageOpportunity[] {
  const { quotes, chainId } = scan;
  if (quotes.length < 2) return [];

  const opportunities: ArbitrageOpportunity[] = [];

  for (let i = 0; i < quotes.length; i++) {
    for (let j = 0; j < quotes.length; j++) {
      if (i === j) continue;

      const opp = checkArbitrage(quotes[i], quotes[j], chainId);
      if (opp) opportunities.push(opp);
    }
  }

  // Sort by net profit descending - execute the most profitable first
  return opportunities.sort((a, b) => b.expectedProfit - a.expectedProfit);
}

/**
 * Update fallback price for a token (called when we get a live ETH/USDC price)
 */
export function updateTokenPrice(symbol: string, priceUSD: number): void {
  FALLBACK_PRICES_USD[symbol.toUpperCase()] = priceUSD;
}
