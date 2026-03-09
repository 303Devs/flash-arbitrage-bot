/**
 * Balancer V2 pool configurations for flash loans
 * Pool IDs are used to borrow capital for arbitrage (0% fee on Balancer)
 *
 * Chain priority: Polygon (highest TVL) > Arbitrum > Base
 */

export interface BalancerPool {
  poolId: string;
  tokens: string[];
  liquidityUSD: number;
  description: string;
}

// Arbitrum pools
const ARBITRUM_POOLS: Record<string, BalancerPool> = {
  'WETH-WBTC-USDC': {
    poolId: '0x64541216bafffeec8ea535bb71fbc927831d0595000100000000000000000002',
    tokens: ['WETH', 'WBTC', 'USDC'],
    liquidityUSD: 501880,
    description: 'WETH/WBTC/USDC Weighted Pool - Highest TVL on Arbitrum',
  },
  'USDC-USDT-DAI': {
    poolId: '0x1533a3278f3f9141d5f820a184ea4b017fce2382000000000000000000000016',
    tokens: ['USDT', 'USDC', 'DAI'],
    liquidityUSD: 138450,
    description: 'USDT/USDC/DAI Stable Pool',
  },
  'ARB-WETH': {
    poolId: '0xa83b8d30f61d7554ad425d8067d8ba6eaeb6b042000200000000000000000525',
    tokens: ['WETH', 'ARB'],
    liquidityUSD: 21610,
    description: '70WETH-30ARB Pool',
  },
};

// Polygon pools (highest TVL - primary chain for flash loans)
const POLYGON_POOLS: Record<string, BalancerPool> = {
  'WETH-WBTC-USDC': {
    poolId: '0x03cd191f589d12b0582a99808cf19851e468e6b500010000000000000000000a',
    tokens: ['WETH', 'WBTC', 'USDC'],
    liquidityUSD: 1731590,
    description: 'Polygon Tricrypto - MASSIVE LIQUIDITY ($1.73M)',
  },
  'WMATIC-USDC-WETH': {
    poolId: '0x0297e37f1873d2dab4487aa67cd56b58e2f27875000100000000000000000002',
    tokens: ['WMATIC', 'USDC', 'WETH'],
    liquidityUSD: 355730,
    description: 'Polygon Base Pool - High MATIC liquidity',
  },
};

// Base pools
const BASE_POOLS: Record<string, BalancerPool> = {
  'WETH-USDC': {
    poolId: '0x250f0df8fbd0d749e4aadc05d91c5d8f9053d4370002000000000000000001e4',
    tokens: ['WETH', 'USDC'],
    liquidityUSD: 485710,
    description: 'Gyroscope ECLP WETH/USDC - Highest TVL on Base',
  },
  'WETH-DAI': {
    poolId: '0x2db50a0e0310723ef0c2a165cb9a9f80d772ba2f00020000000000000000000d',
    tokens: ['WETH', 'DAI'],
    liquidityUSD: 2950,
    description: 'STABAL3/WETH Pool',
  },
};

export const BALANCER_POOLS: Record<number, Record<string, BalancerPool>> = {
  137:   POLYGON_POOLS,  // Primary - highest TVL
  42161: ARBITRUM_POOLS,
  8453:  BASE_POOLS,
};

// Flash loan recommendations by chain
export const FLASH_LOAN_RECOMMENDATIONS = {
  137: {
    name: 'Polygon',
    priority: 1,
    maxLiquidityUSD: 1731590,
    bestPools: ['WETH-WBTC-USDC', 'WMATIC-USDC-WETH'],
    gasEstimateUSD: 0.40,
  },
  42161: {
    name: 'Arbitrum',
    priority: 2,
    maxLiquidityUSD: 501880,
    bestPools: ['WETH-WBTC-USDC', 'USDC-USDT-DAI'],
    gasEstimateUSD: 0.25,
  },
  8453: {
    name: 'Base',
    priority: 3,
    maxLiquidityUSD: 485710,
    bestPools: ['WETH-USDC'],
    gasEstimateUSD: 0.12,
  },
};

/**
 * Find the best Balancer pool for flash loan on a given chain
 */
export function findBestPool(chainId: number, tokenSymbol: string): BalancerPool | null {
  const pools = BALANCER_POOLS[chainId];
  if (!pools) return null;

  // Sort by liquidity descending, pick first that contains the token
  return Object.values(pools)
    .filter(p => p.tokens.includes(tokenSymbol))
    .sort((a, b) => b.liquidityUSD - a.liquidityUSD)[0] ?? null;
}

/**
 * Get all flash-loanable tokens on a chain
 */
export function getAvailableTokens(chainId: number): string[] {
  const pools = BALANCER_POOLS[chainId];
  if (!pools) return [];
  const tokens = new Set<string>();
  Object.values(pools).forEach(p => p.tokens.forEach(t => tokens.add(t)));
  return Array.from(tokens);
}
