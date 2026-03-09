/**
 * Phase 1: Cross-DEX Flash Loan Arbitrage
 * Entry point - wires everything together
 *
 * Start: pnpm dev
 */

import './utils/bigint-serializer.js'; // Must be first - patches BigInt.toJSON

import { ethers } from 'ethers';
import { getEnabledChains } from './config/chains.js';
import { env, config } from './config/environment.js';
import { getContractAddress } from './contracts/deployed-addresses.js';
import { EnterpriseArbitrageExecutor } from './execution/executor.js';
import { logger } from './monitoring/logger.js';
import { tradeTracker } from './monitoring/trade-tracker.js';

async function main() {
  logger.info('🚀 Phase 1 Arbitrage Bot starting...');

  if (!env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in .env');
  }

  // Build provider and contract maps for enabled chains
  const chains   = getEnabledChains();
  const providers = new Map<number, ethers.Provider>();
  const contracts = new Map<number, string>();

  for (const chain of chains) {
    // Use WebSocket if available (faster for event subscriptions), HTTP otherwise
    const wsUrl   = chain.websocketUrls[0];
    const httpUrl = chain.rpcUrls[0];

    if (!wsUrl && !httpUrl) {
      logger.warn(`No RPC URL for chain ${chain.name} - skipping`);
      continue;
    }

    const provider = wsUrl
      ? new ethers.WebSocketProvider(wsUrl)
      : new ethers.JsonRpcProvider(httpUrl);

    providers.set(chain.id, provider);
    logger.connection('connected', wsUrl ? 'WebSocket' : 'HTTP', chain.name);

    // Load deployed contract address
    const contractAddr = getContractAddress(chain.id) || config.contracts[chain.id];
    if (!contractAddr) {
      logger.warn(`No contract deployed on ${chain.name} - deploy first with pnpm deploy:${chain.shortName.toLowerCase()}`);
      continue;
    }

    contracts.set(chain.id, contractAddr);
    logger.info(`  ✅ ${chain.name}: contract ${contractAddr.slice(0, 10)}...`);
  }

  if (providers.size === 0) {
    throw new Error('No chains configured. Check RPC endpoints in .env');
  }

  if (contracts.size === 0) {
    throw new Error('No contracts deployed. Run: pnpm deploy:arbitrumSepolia (testnet) or pnpm deploy:arbitrum (mainnet)');
  }

  // Initialize executor
  const executor = new EnterpriseArbitrageExecutor(
    providers,
    contracts,
    env.PRIVATE_KEY,
    env.REDIS_URL
  );

  await executor.initialize();

  // Graceful shutdown
  process.on('SIGINT',  () => gracefulShutdown(executor));
  process.on('SIGTERM', () => gracefulShutdown(executor));

  logger.info('✅ Bot running. Waiting for opportunities...');
  logger.info('   (Implement price scanner in src/arbitrage/ to detect opportunities)');
}

async function gracefulShutdown(executor: EnterpriseArbitrageExecutor) {
  logger.info('🛑 Shutting down...');
  await executor.emergencyStop();

  const stats = tradeTracker.getStats();
  logger.info('📊 Final stats', stats);

  process.exit(0);
}

main().catch((err) => {
  logger.error('💥 Fatal error', { error: err.message });
  process.exit(1);
});
