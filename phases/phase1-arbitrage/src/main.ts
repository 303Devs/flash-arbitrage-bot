/**
 * Phase 1: Cross-DEX Flash Loan Arbitrage
 * Entry point - wires price scanner → opportunity detector → executor
 *
 * Flow:
 *   Scanner polls DEX prices every 1s
 *   → OpportunityDetector compares prices across DEXs
 *   → Executor validates, builds calldata, submits flash loan tx
 *
 * Start: pnpm dev
 */

import './utils/bigint-serializer.js'; // Must be first - patches BigInt.toJSON

import { ethers } from 'ethers';
import { getEnabledChains } from './config/chains.js';
import { env, config } from './config/environment.js';
import { getContractAddress } from './contracts/deployed-addresses.js';
import { EnterpriseArbitrageExecutor } from './execution/executor.js';
import { PriceScanner } from './arbitrage/scanner.js';
import { detectOpportunities } from './arbitrage/opportunity-detector.js';
import { logger } from './monitoring/logger.js';
import { tradeTracker } from './monitoring/trade-tracker.js';

async function main() {
  logger.info('🚀 Phase 1 Arbitrage Bot starting...');

  if (!env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set in .env');
  }

  // Build provider and contract maps for enabled chains
  const chains    = getEnabledChains();
  const providers = new Map<number, ethers.Provider>();
  const contracts = new Map<number, string>();

  for (const chain of chains) {
    const wsUrl   = chain.websocketUrls[0];
    const httpUrl = chain.rpcUrls[0];

    if (!wsUrl && !httpUrl) {
      logger.warn(`No RPC URL for chain ${chain.name} - skipping`);
      continue;
    }

    try {
      const provider = wsUrl
        ? new ethers.WebSocketProvider(wsUrl)
        : new ethers.JsonRpcProvider(httpUrl);

      // Verify connection
      await provider.getBlockNumber();
      providers.set(chain.id, provider);
      logger.connection('connected', wsUrl ? 'WebSocket' : 'HTTP', chain.name);
    } catch (err: any) {
      logger.warn(`Failed to connect to ${chain.name}: ${err.message} - skipping`);
      continue;
    }

    // Load deployed contract address
    const contractAddr = getContractAddress(chain.id) || config.contracts[chain.id];
    if (!contractAddr || contractAddr === ethers.ZeroAddress) {
      logger.warn(`No contract deployed on ${chain.name}. Deploy first: pnpm deploy:${chain.shortName.toLowerCase()}`);
      continue;
    }

    contracts.set(chain.id, contractAddr);
    logger.info(`  ✅ ${chain.name}: contract ${contractAddr.slice(0, 10)}...`);
  }

  if (providers.size === 0) {
    throw new Error('No chains connected. Check RPC endpoints in .env');
  }

  if (contracts.size === 0) {
    throw new Error(
      'No contracts deployed. Run: pnpm deploy:arbitrumSepolia (testnet) or pnpm deploy:arbitrum (mainnet)'
    );
  }

  // Remove providers that have no deployed contract (scanner still needs them all)
  const activeProviders = new Map<number, ethers.Provider>(
    [...providers].filter(([id]) => contracts.has(id))
  );

  // Initialize executor
  const executor = new EnterpriseArbitrageExecutor(
    activeProviders,
    contracts,
    env.PRIVATE_KEY,
    env.REDIS_URL
  );

  await executor.initialize();

  // Initialize price scanner (uses all providers, not just ones with contracts)
  const scanner = new PriceScanner(providers, 1000);

  let opportunitiesDetected = 0;
  let opportunitiesExecuted = 0;

  scanner.on('scanResult', async (scanResult) => {
    const opportunities = detectOpportunities(scanResult);
    if (opportunities.length === 0) return;

    opportunitiesDetected += opportunities.length;

    // Only execute if we have a contract on this chain
    if (!contracts.has(scanResult.chainId)) return;

    // Execute the most profitable opportunity
    const best = opportunities[0];
    tradeTracker.recordOpportunity(best.expectedProfit);

    logger.info(`🎯 Opportunity detected`, {
      pair:       `${best.tokenASymbol}/${best.tokenBSymbol}`,
      buyDex:     best.buyDex,
      sellDex:    best.sellDex,
      profit:     `$${best.expectedProfit.toFixed(2)}`,
      chain:      scanResult.chainId,
    });

    const result = await executor.executeArbitrage(best);

    if (result.success) {
      opportunitiesExecuted++;
      tradeTracker.recordExecution(true, best.expectedProfit);
    } else {
      tradeTracker.recordExecution(false, 0);
      if (result.failureReason && !result.failureReason.includes('Stale') && !result.failureReason.includes('Circuit breaker')) {
        logger.warn(`Execution failed: ${result.failureReason}`);
      }
    }
  });

  // Graceful shutdown handlers
  process.on('SIGINT',  () => gracefulShutdown(scanner, executor));
  process.on('SIGTERM', () => gracefulShutdown(scanner, executor));

  // Start scanning
  scanner.start();

  logger.info('✅ Bot running', {
    chains:    [...providers.keys()].join(', '),
    contracts: [...contracts.keys()].join(', '),
    scanning:  'every 1s',
  });

  // Periodic stats logging
  setInterval(() => {
    const stats = tradeTracker.getStats();
    logger.info('📈 Progress', {
      opportunitiesDetected,
      opportunitiesExecuted,
      ...stats,
    });
  }, 60_000);
}

async function gracefulShutdown(scanner: PriceScanner, executor: EnterpriseArbitrageExecutor) {
  logger.info('🛑 Shutting down...');
  scanner.stop();
  await executor.emergencyStop();

  const stats = tradeTracker.getStats();
  logger.info('📊 Final stats', stats);

  process.exit(0);
}

main().catch((err) => {
  logger.error('💥 Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
