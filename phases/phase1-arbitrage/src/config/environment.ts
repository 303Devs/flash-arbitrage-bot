/**
 * Phase 1 environment configuration
 * Simplified - only what's needed for cross-DEX arbitrage
 */

import dotenv from 'dotenv';
dotenv.config();

const e = process.env;

export const env = {
  NODE_ENV: (e.NODE_ENV || 'development') as 'development' | 'production',
  LOG_LEVEL: (e.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // RPC WebSocket (primary - for event subscriptions)
  QUICKNODE_ARBITRUM_WSS: e.QUICKNODE_ARBITRUM_WSS || '',
  QUICKNODE_POLYGON_WSS:  e.QUICKNODE_POLYGON_WSS  || '',
  QUICKNODE_BASE_WSS:     e.QUICKNODE_BASE_WSS     || '',
  ALCHEMY_ARBITRUM_WSS:   e.ALCHEMY_ARBITRUM_WSS   || '',
  ALCHEMY_POLYGON_WSS:    e.ALCHEMY_POLYGON_WSS    || '',
  ALCHEMY_BASE_WSS:       e.ALCHEMY_BASE_WSS       || '',

  // RPC HTTP (fallback + hardhat)
  QUICKNODE_ARBITRUM_HTTP: e.QUICKNODE_ARBITRUM_HTTP || '',
  QUICKNODE_POLYGON_HTTP:  e.QUICKNODE_POLYGON_HTTP  || '',
  QUICKNODE_BASE_HTTP:     e.QUICKNODE_BASE_HTTP     || '',
  ALCHEMY_ARBITRUM_HTTP:   e.ALCHEMY_ARBITRUM_HTTP   || '',
  ALCHEMY_POLYGON_HTTP:    e.ALCHEMY_POLYGON_HTTP    || '',
  ALCHEMY_BASE_HTTP:       e.ALCHEMY_BASE_HTTP       || '',
  ALCHEMY_API_KEY:         e.ALCHEMY_API_KEY         || '',

  // Wallet
  PRIVATE_KEY: e.PRIVATE_KEY || '',

  // Flash loan provider addresses (with mainnet defaults)
  AAVE_POOL_ARBITRUM: e.AAVE_POOL_ARBITRUM || '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  AAVE_POOL_POLYGON:  e.AAVE_POOL_POLYGON  || '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  AAVE_POOL_BASE:     e.AAVE_POOL_BASE     || '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  BALANCER_VAULT:     e.BALANCER_VAULT_ADDRESS || '0xBA12222222228d8Ba445958a75a0704d566BF2C8',

  // Gas limits (gwei)
  MAX_GAS_PRICE_GWEI_ARBITRUM: e.MAX_GAS_PRICE_GWEI_ARBITRUM || '5',
  MAX_GAS_PRICE_GWEI_POLYGON:  e.MAX_GAS_PRICE_GWEI_POLYGON  || '100',
  MAX_GAS_PRICE_GWEI_BASE:     e.MAX_GAS_PRICE_GWEI_BASE     || '2',

  // Minimum profit thresholds (USD)
  MIN_PROFIT_USD_ARBITRUM: e.MIN_PROFIT_USD_ARBITRUM || '3',
  MIN_PROFIT_USD_POLYGON:  e.MIN_PROFIT_USD_POLYGON  || '1',
  MIN_PROFIT_USD_BASE:     e.MIN_PROFIT_USD_BASE     || '2',

  // Deployed contract addresses (set after deployment)
  ARBITRAGE_CONTRACT_ARBITRUM: e.ARBITRAGE_CONTRACT_ARBITRUM || '',
  ARBITRAGE_CONTRACT_POLYGON:  e.ARBITRAGE_CONTRACT_POLYGON  || '',
  ARBITRAGE_CONTRACT_BASE:     e.ARBITRAGE_CONTRACT_BASE     || '',

  // Optional: Redis for nonce persistence
  REDIS_URL: e.REDIS_URL,

  // Optional: Monitoring webhooks
  DISCORD_WEBHOOK_URL: e.DISCORD_WEBHOOK_URL,
  TELEGRAM_BOT_TOKEN:  e.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID:    e.TELEGRAM_CHAT_ID,

  // Chains to enable (comma-separated)
  ENABLED_CHAINS: e.ENABLED_CHAINS || 'arbitrum,polygon,base',
};

// Derived config with proper types
export const config = {
  nodeEnv:  env.NODE_ENV,
  logLevel: env.LOG_LEVEL,

  gas: {
    maxGasPrice: {
      42161: BigInt(env.MAX_GAS_PRICE_GWEI_ARBITRUM) * BigInt(1_000_000_000),
      137:   BigInt(env.MAX_GAS_PRICE_GWEI_POLYGON)  * BigInt(1_000_000_000),
      8453:  BigInt(env.MAX_GAS_PRICE_GWEI_BASE)     * BigInt(1_000_000_000),
    } as Record<number, bigint>,
  },

  profit: {
    minimumUSD: {
      42161: parseFloat(env.MIN_PROFIT_USD_ARBITRUM),
      137:   parseFloat(env.MIN_PROFIT_USD_POLYGON),
      8453:  parseFloat(env.MIN_PROFIT_USD_BASE),
    } as Record<number, number>,
  },

  flashLoan: {
    aave: {
      42161: env.AAVE_POOL_ARBITRUM,
      137:   env.AAVE_POOL_POLYGON,
      8453:  env.AAVE_POOL_BASE,
    } as Record<number, string>,
    balancerVault: env.BALANCER_VAULT,
  },

  contracts: {
    42161: env.ARBITRAGE_CONTRACT_ARBITRUM,
    137:   env.ARBITRAGE_CONTRACT_POLYGON,
    8453:  env.ARBITRAGE_CONTRACT_BASE,
  } as Record<number, string>,
};
