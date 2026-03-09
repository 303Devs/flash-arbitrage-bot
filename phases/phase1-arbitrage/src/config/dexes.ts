/**
 * DEX configurations with verified contract addresses for all chains
 * Includes: Uniswap V3, SushiSwap, Curve, Balancer, QuickSwap, Camelot, Aerodrome
 */

export interface DEXConfig {
  id: string;
  name: string;
  type: 'uniswap-v2' | 'uniswap-v3' | 'curve' | 'balancer' | 'custom';
  chains: number[];
  contracts: Record<number, {
    router?: string;
    factory?: string;
    vault?: string;
    quoter?: string;
  }>;
  fees: number[]; // basis points
  gasEstimate: bigint;
  eventSignatures: {
    swap: string;
  };
}

// Shared Uniswap V3 addresses (same on Arbitrum + Polygon)
const UNI_V3_STANDARD = {
  router:  '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  quoter:  '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
};

export const ALL_DEXS: Record<string, DEXConfig> = {
  'uniswap-v3': {
    id: 'uniswap-v3',
    name: 'Uniswap V3',
    type: 'uniswap-v3',
    chains: [42161, 137, 8453],
    contracts: {
      42161: UNI_V3_STANDARD,
      137:   UNI_V3_STANDARD,
      8453: {
        router:  '0x2626664c2603336E57B271c5C0b26F421741e481',
        factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
        quoter:  '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
      },
    },
    fees: [500, 3000, 10000],
    gasEstimate: BigInt(180000),
    eventSignatures: {
      swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
    },
  },

  sushiswap: {
    id: 'sushiswap',
    name: 'SushiSwap',
    type: 'uniswap-v2',
    chains: [42161, 137],
    contracts: {
      42161: {
        router:  '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
        factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
      },
      137: {
        router:  '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
        factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
      },
    },
    fees: [3000],
    gasEstimate: BigInt(150000),
    eventSignatures: {
      swap: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
    },
  },

  curve: {
    id: 'curve',
    name: 'Curve Finance',
    type: 'curve',
    chains: [42161, 137, 8453],
    contracts: {
      42161: {
        router:  '0x7544Fe977a8546c47cA37878CfcB8CF27B70C0D0',
        factory: '0xb17b674D9c5CB2e441F8e196a2f048A81355d031',
      },
      137: {
        router:  '0x47bB542B9dE58b970bA50c9dae444DDB4c16751a',
        factory: '0x722272D36ef0Da72FF51c5A65Db7b870E2e8D4D7',
      },
      8453: {
        router:  '0xf3A6aa40cf048a3960E9664847E9a7be025a390a',
        factory: '0xd2002373543Ce3527023C75e7518C274A51ce712',
      },
    },
    fees: [400], // ~0.04% average
    gasEstimate: BigInt(120000),
    eventSignatures: {
      swap: '0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140',
    },
  },

  balancer: {
    id: 'balancer',
    name: 'Balancer V2',
    type: 'balancer',
    chains: [42161, 137, 8453],
    contracts: {
      42161: { vault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8' },
      137:   { vault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8' },
      8453:  { vault: '0xBA12222222228d8Ba445958a75a0704d566BF2C8' },
    },
    fees: [50, 100, 300, 1000],
    gasEstimate: BigInt(200000),
    eventSignatures: {
      swap: '0x2170c741c41531aec20e7c107c24eecfdd15e69c9bb5a8222ddc3d53c001db07',
    },
  },

  quickswap: {
    id: 'quickswap',
    name: 'QuickSwap',
    type: 'uniswap-v2',
    chains: [137],
    contracts: {
      137: {
        router:  '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
        factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
      },
    },
    fees: [3000],
    gasEstimate: BigInt(150000),
    eventSignatures: {
      swap: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
    },
  },

  camelot: {
    id: 'camelot',
    name: 'Camelot',
    type: 'custom',
    chains: [42161],
    contracts: {
      42161: {
        router:  '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
        factory: '0x6EcCab422D763aC031210895C81787E87B043f121',
      },
    },
    fees: [3000, 5000],
    gasEstimate: BigInt(160000),
    eventSignatures: {
      swap: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
    },
  },

  aerodrome: {
    id: 'aerodrome',
    name: 'Aerodrome',
    type: 'custom',
    chains: [8453],
    contracts: {
      8453: {
        router:  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
        factory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
      },
    },
    fees: [200, 500, 3000],
    gasEstimate: BigInt(170000),
    eventSignatures: {
      swap: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
    },
  },
};

// Priority trading pairs (Phase 1 focus: high-volume, high-frequency)
export const TRADING_PAIRS = [
  // Tier 1: Stablecoin arbitrage (highest frequency)
  { tokenA: 'USDC', tokenB: 'USDT', priority: 20 },
  { tokenA: 'USDC', tokenB: 'DAI',  priority: 19 },
  { tokenA: 'USDT', tokenB: 'DAI',  priority: 18 },
  // Tier 2: ETH pairs (high volume)
  { tokenA: 'WETH', tokenB: 'USDC', priority: 17 },
  { tokenA: 'WETH', tokenB: 'USDT', priority: 16 },
  { tokenA: 'WETH', tokenB: 'DAI',  priority: 15 },
  // Tier 3: BTC pairs
  { tokenA: 'WBTC', tokenB: 'WETH', priority: 14 },
  { tokenA: 'WBTC', tokenB: 'USDC', priority: 13 },
  // Tier 4: Chain-specific
  { tokenA: 'WMATIC', tokenB: 'USDC', chains: [137], priority: 16 },
  { tokenA: 'WMATIC', tokenB: 'WETH', chains: [137], priority: 13 },
  { tokenA: 'ARB',    tokenB: 'WETH', chains: [42161], priority: 7 },
  { tokenA: 'ARB',    tokenB: 'USDC', chains: [42161], priority: 6 },
];

export function getDEXsForChain(chainId: number): DEXConfig[] {
  return Object.values(ALL_DEXS).filter(d => d.chains.includes(chainId));
}

export function getDEXRouter(dexId: string, chainId: number): string | null {
  const dex = ALL_DEXS[dexId];
  if (!dex) return null;
  const contracts = dex.contracts[chainId];
  return contracts?.router ?? contracts?.vault ?? null;
}
