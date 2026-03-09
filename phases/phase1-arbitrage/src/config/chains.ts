/**
 * Chain configurations with RPC endpoints (WebSocket + HTTP)
 * Supports Arbitrum, Polygon, Base with automatic failover
 */

export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  rpcUrls: string[];
  websocketUrls: string[];
  currency: string;
  blockTime: number; // ms
  gasPrice: {
    default: bigint;
    max: bigint;
  };
  flashLoanProviders: string[];
}

function buildUrls(primary: string | undefined, fallbacks: (string | undefined)[]): string[] {
  return [primary, ...fallbacks].filter((u): u is string => !!u);
}

export const ALL_CHAINS: Record<string, ChainConfig> = {
  arbitrum: {
    id: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    rpcUrls: buildUrls(
      process.env.QUICKNODE_ARBITRUM_HTTP,
      [
        process.env.ALCHEMY_ARBITRUM_HTTP,
        'https://arbitrum.public-rpc.com',
        'https://rpc.ankr.com/arbitrum',
      ]
    ),
    websocketUrls: buildUrls(
      process.env.QUICKNODE_ARBITRUM_WSS,
      [process.env.ALCHEMY_ARBITRUM_WSS]
    ),
    currency: 'ETH',
    blockTime: 400, // ~400ms
    gasPrice: {
      default: BigInt(100000000),  // 0.1 gwei
      max:     BigInt(5000000000), // 5 gwei
    },
    flashLoanProviders: ['balancer', 'aave'],
  },

  polygon: {
    id: 137,
    name: 'Polygon',
    shortName: 'MATIC',
    rpcUrls: buildUrls(
      process.env.QUICKNODE_POLYGON_HTTP,
      [
        process.env.ALCHEMY_POLYGON_HTTP,
        'https://rpc.ankr.com/polygon',
      ]
    ),
    websocketUrls: buildUrls(
      process.env.QUICKNODE_POLYGON_WSS,
      [process.env.ALCHEMY_POLYGON_WSS]
    ),
    currency: 'MATIC',
    blockTime: 2000, // ~2s
    gasPrice: {
      default: BigInt(30000000000),  // 30 gwei
      max:     BigInt(100000000000), // 100 gwei
    },
    flashLoanProviders: ['balancer', 'aave'],
  },

  base: {
    id: 8453,
    name: 'Base',
    shortName: 'BASE',
    rpcUrls: buildUrls(
      process.env.QUICKNODE_BASE_HTTP,
      [
        process.env.ALCHEMY_BASE_HTTP,
        'https://mainnet.base.org',
        'https://rpc.ankr.com/base',
      ]
    ),
    websocketUrls: buildUrls(
      process.env.QUICKNODE_BASE_WSS,
      [process.env.ALCHEMY_BASE_WSS]
    ),
    currency: 'ETH',
    blockTime: 2000, // ~2s
    gasPrice: {
      default: BigInt(50000000),   // 0.05 gwei
      max:     BigInt(2000000000), // 2 gwei
    },
    flashLoanProviders: ['balancer', 'aave'],
  },
};

export function getEnabledChains(): ChainConfig[] {
  const names = (process.env.ENABLED_CHAINS || 'arbitrum,polygon,base').split(',');
  return names.map(n => ALL_CHAINS[n.trim()]).filter((c): c is ChainConfig => !!c);
}

export function getChainById(chainId: number): ChainConfig | null {
  return Object.values(ALL_CHAINS).find(c => c.id === chainId) ?? null;
}

export function getChainByName(name: string): ChainConfig | null {
  return ALL_CHAINS[name] ?? null;
}

// Connection health thresholds
export const CONNECTION_THRESHOLDS = {
  maxLatencyMs: 200,
  maxFailureRate: 0.05,
  healthCheckIntervalMs: 5000,
  connectionTimeoutMs: 3000,
  retryAttempts: 3,
  backoffMultiplier: 1.5,
};
