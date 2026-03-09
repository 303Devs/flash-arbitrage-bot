/**
 * Token addresses for all supported chains
 *
 * CRITICAL: Decimals matter for profit calculation!
 *   USDC = 6 decimals (NOT 18) - multiplying by wrong decimals = 10^12x error
 *   USDT = 6 decimals
 *   WETH = 18 decimals
 *   WBTC = 8 decimals
 *   DAI  = 18 decimals
 *
 * Always normalize to 18 decimals before math, denormalize on output.
 */

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
}

// Mainnet token addresses (production-tested)
export const MAINNET_TOKENS: Record<number, Record<string, TokenInfo>> = {
  // Arbitrum One (42161)
  42161: {
    WETH: { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, symbol: 'WETH' },
    USDC: { address: '0xA0b86a33E6425573c19B72A2D65b01eE80d60d53', decimals: 6,  symbol: 'USDC' }, // USDC.e
    USDT: { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6,  symbol: 'USDT' },
    DAI:  { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, symbol: 'DAI'  },
    WBTC: { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8,  symbol: 'WBTC' },
    ARB:  { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, symbol: 'ARB'  },
    LINK: { address: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18, symbol: 'LINK' },
    UNI:  { address: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', decimals: 18, symbol: 'UNI'  },
    AAVE: { address: '0xba5DdD1f9d7F570dc94a51479a000E3BCE967196', decimals: 18, symbol: 'AAVE' },
    BAL:  { address: '0x040d1EdC9569d4Bab2D15287Dc5A4F10F56a56B8', decimals: 18, symbol: 'BAL'  },
    CRV:  { address: '0x11cDb42B0EB46D95f990BeDD4695A6e3fA034978', decimals: 18, symbol: 'CRV'  },
  },

  // Polygon (137)
  137: {
    WETH:   { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, symbol: 'WETH'   },
    WMATIC: { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, symbol: 'WMATIC' },
    USDC:   { address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', decimals: 6,  symbol: 'USDC'   }, // USDC.e
    USDT:   { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6,  symbol: 'USDT'   },
    DAI:    { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', decimals: 18, symbol: 'DAI'    },
    WBTC:   { address: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6', decimals: 8,  symbol: 'WBTC'   },
    LINK:   { address: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', decimals: 18, symbol: 'LINK'   },
    AAVE:   { address: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B', decimals: 18, symbol: 'AAVE'   },
    BAL:    { address: '0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3', decimals: 18, symbol: 'BAL'    },
    CRV:    { address: '0x172370d5Cd63279eFa6d502DAB29171933a610AF', decimals: 18, symbol: 'CRV'    },
  },

  // Base (8453)
  8453: {
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
    USDC: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  symbol: 'USDC' }, // Native USDC
    DAI:  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, symbol: 'DAI'  },
    BAL:  { address: '0x4158734D47Fc9692176B5085E0F52ee0Da5d47F1', decimals: 18, symbol: 'BAL'  },
  },
};

// Testnet token addresses
export const TESTNET_TOKENS: Record<number, Record<string, TokenInfo>> = {
  // Arbitrum Sepolia (421614)
  421614: {
    WETH: { address: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', decimals: 18, symbol: 'WETH' },
    USDC: { address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', decimals: 6,  symbol: 'USDC' },
    USDT: { address: '0xb1D4538B4571d411F07960EF2838Ce337FE1E80E', decimals: 6,  symbol: 'USDT' },
    DAI:  { address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', decimals: 18, symbol: 'DAI'  },
  },
  // Polygon Amoy (80002)
  80002: {
    USDC:  { address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', decimals: 6,  symbol: 'USDC'  },
    MATIC: { address: '0x0000000000000000000000000000000000001010', decimals: 18, symbol: 'MATIC' },
  },
  // Base Sepolia (84532)
  84532: {
    WETH: { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
    USDC: { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6,  symbol: 'USDC' },
    DAI:  { address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', decimals: 18, symbol: 'DAI'  },
  },
};

export function getTokens(chainId: number, mainnet = true): Record<string, TokenInfo> {
  const map = mainnet ? MAINNET_TOKENS : TESTNET_TOKENS;
  return map[chainId] ?? {};
}

export function getToken(chainId: number, symbol: string, mainnet = true): TokenInfo | null {
  return getTokens(chainId, mainnet)[symbol.toUpperCase()] ?? null;
}

/**
 * Normalize a token amount to 18 decimals for safe arithmetic
 */
export function normalizeAmount(amount: bigint, decimals: number): bigint {
  if (decimals === 18) return amount;
  if (decimals < 18) return amount * (10n ** BigInt(18 - decimals));
  return amount / (10n ** BigInt(decimals - 18));
}

/**
 * Denormalize from 18 decimals back to token decimals
 */
export function denormalizeAmount(amount: bigint, decimals: number): bigint {
  if (decimals === 18) return amount;
  if (decimals < 18) return amount / (10n ** BigInt(18 - decimals));
  return amount * (10n ** BigInt(decimals - 18));
}
