#!/usr/bin/env tsx

/**
 * Test Script for RPC Provider Manager
 * 
 * This script demonstrates the RPC Provider Manager functionality
 * and can be used for manual testing and validation.
 */

import dotenv from 'dotenv';
import { rpcProviderManager } from '../backend/src/data/RpcProviderManager.js';
import { logger } from '../backend/src/utils/Logger.js';

// Load environment variables
dotenv.config();

async function testRpcProviderManager() {
  try {
    logger.startup('Starting RPC Provider Manager test...');
    
    // Initialize the RPC Provider Manager
    await rpcProviderManager.initialize();
    
    // Check health status
    logger.info('Health Status:', { healthy: rpcProviderManager.isHealthy() });
    
    // Get connection statistics
    const connectionStats = rpcProviderManager.getConnectionStats();
    logger.info('Connection Statistics:');
    connectionStats.forEach(stats => {
      logger.info(`Chain ${stats.chainId} (${stats.chainName}):`, {
        totalProviders: stats.totalProviders,
        healthyProviders: stats.healthyProviders,
        currentProvider: stats.currentProvider,
        averageResponseTime: `${stats.averageResponseTime}ms`
      });
    });
    
    // Test each chain
    const chains = [42161, 137, 8453]; // Arbitrum, Polygon, Base
    
    for (const chainId of chains) {
      logger.info(`Testing chain ${chainId}...`);
      
      try {
        // Test HTTP provider
        const httpProvider = rpcProviderManager.getHttpProvider(chainId);
        const blockNumber = await httpProvider.getBlockNumber();
        logger.info(`Chain ${chainId} latest block:`, { 
          blockNumber: blockNumber.toString() 
        });
        
        // Test WebSocket provider
        const wsProvider = rpcProviderManager.getWebSocketProvider(chainId);
        logger.info(`Chain ${chainId} WebSocket provider initialized`);
        
        // Test wallet client
        const walletClient = rpcProviderManager.getWalletClient(chainId);
        logger.info(`Chain ${chainId} wallet client:`, { 
          address: walletClient.account.address 
        });
        
        // Get provider statistics
        const providerStats = rpcProviderManager.getProviderStats(chainId);
        logger.info(`Chain ${chainId} provider stats:`, 
          providerStats.map(p => ({
            name: p.name,
            priority: p.priority,
            healthy: p.isHealthy,
            responseTime: `${p.responseTime}ms`,
            failures: p.consecutiveFailures
          }))
        );
        
      } catch (error) {
        logger.error(`Error testing chain ${chainId}:`, error);
      }
    }
    
    // Test provider switching
    logger.info('Testing provider switching...');
    try {
      const switchResult = await rpcProviderManager.switchProvider(42161, 'manual_test');
      logger.info('Provider switch result:', { success: switchResult });
      
      const newStats = rpcProviderManager.getConnectionStats();
      const arbitrumStats = newStats.find(s => s.chainId === 42161);
      logger.info('New Arbitrum provider:', { 
        currentProvider: arbitrumStats?.currentProvider 
      });
    } catch (error) {
      logger.error('Error during provider switch:', error);
    }
    
    // Wait for a few health checks
    logger.info('Waiting for health check cycles...');
    await new Promise(resolve => setTimeout(resolve, 35000)); // Wait 35 seconds
    
    // Check final statistics
    const finalStats = rpcProviderManager.getConnectionStats();
    logger.info('Final connection statistics:');
    finalStats.forEach(stats => {
      logger.info(`Chain ${stats.chainId}:`, {
        currentProvider: stats.currentProvider,
        healthyProviders: stats.healthyProviders,
        averageResponseTime: `${stats.averageResponseTime}ms`
      });
    });
    
    logger.startup('RPC Provider Manager test completed successfully');
    
  } catch (error) {
    logger.error('RPC Provider Manager test failed:', error);
    process.exit(1);
  } finally {
    // Graceful shutdown
    await rpcProviderManager.shutdown();
    logger.startup('Test cleanup completed');
    process.exit(0);
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  logger.shutdown('Received SIGINT, shutting down gracefully...');
  await rpcProviderManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.shutdown('Received SIGTERM, shutting down gracefully...');
  await rpcProviderManager.shutdown();
  process.exit(0);
});

// Run the test
testRpcProviderManager().catch(error => {
  logger.error('Unhandled error in test script:', error);
  process.exit(1);
});
