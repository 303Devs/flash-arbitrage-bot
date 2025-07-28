#!/usr/bin/env tsx

/**
 * Simple test script to identify Phase 2 integration issues
 */

import { logger } from '../backend/src/utils/Logger.js';

async function testPhase2Integration(): Promise<void> {
  try {
    console.log('🔄 Testing Phase 2 Component Imports...');
    
    // Test basic logger
    logger.info('Test logger working');
    console.log('✅ Logger import successful');
    
    // Test RPC Provider Manager import
    try {
      const { rpcProviderManager } = await import('../backend/src/data/RpcProviderManager.js');
      console.log('✅ RPC Provider Manager import successful');
      console.log('  - isHealthy():', typeof rpcProviderManager.isHealthy);
      console.log('  - initialize():', typeof rpcProviderManager.initialize);
    } catch (error) {
      console.error('❌ RPC Provider Manager import failed:', error);
    }
    
    // Test MultiChain Listener import
    try {
      const { multiChainListener } = await import('../backend/src/data/MultiChainListener.js');
      console.log('✅ MultiChain Listener import successful');
      console.log('  - isHealthy():', typeof multiChainListener.isHealthy);
      console.log('  - initialize():', typeof multiChainListener.initialize);
    } catch (error) {
      console.error('❌ MultiChain Listener import failed:', error);
    }
    
    // Test Connection Health Monitor import
    try {
      const { connectionHealthMonitor } = await import('../backend/src/data/ConnectionHealthMonitor.js');
      console.log('✅ Connection Health Monitor import successful');
      console.log('  - isHealthy():', typeof connectionHealthMonitor.isHealthy);
      console.log('  - initialize():', typeof connectionHealthMonitor.initialize);
    } catch (error) {
      console.error('❌ Connection Health Monitor import failed:', error);
    }
    
    // Test Provider Failover Logic import
    try {
      const { providerFailoverLogic } = await import('../backend/src/data/ProviderFailoverLogic.js');
      console.log('✅ Provider Failover Logic import successful');
      console.log('  - isHealthy():', typeof providerFailoverLogic.isHealthy);
      console.log('  - initialize():', typeof providerFailoverLogic.initialize);
    } catch (error) {
      console.error('❌ Provider Failover Logic import failed:', error);
    }
    
    // Test Redis Cache import
    try {
      const { redisCache } = await import('../backend/src/storage/RedisCache.js');
      console.log('✅ Redis Cache import successful');
      console.log('  - isHealthy():', typeof redisCache.isHealthy);
      console.log('  - connect():', typeof redisCache.connect);
    } catch (error) {
      console.error('❌ Redis Cache import failed:', error);
    }
    
    // Test PostgreSQL Repository import
    try {
      const { postgresRepository } = await import('../backend/src/storage/PostgresRepository.js');
      console.log('✅ PostgreSQL Repository import successful');
      console.log('  - isHealthy():', typeof postgresRepository.isHealthy);
      console.log('  - connect():', typeof postgresRepository.connect);
      console.log('  - createHealthMonitoringTables():', typeof postgresRepository.createHealthMonitoringTables);
    } catch (error) {
      console.error('❌ PostgreSQL Repository import failed:', error);
    }
    
    console.log('\n🔄 Testing Component Initialization Order...');
    
    // Set minimal required environment variables for testing
    process.env.PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    process.env.POSTGRES_HOST = 'localhost';
    process.env.POSTGRES_PORT = '5432';
    process.env.POSTGRES_APP_DB = 'test_db';
    process.env.POSTGRES_APP_USER = 'test_user';
    process.env.POSTGRES_APP_PASSWORD = 'test_password';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    
    // Test if RPC Provider Manager can be initialized without real connections
    try {
      const { rpcProviderManager } = await import('../backend/src/data/RpcProviderManager.js');
      console.log('  - RPC Provider Manager methods available:', {
        initialize: typeof rpcProviderManager.initialize,
        shutdown: typeof rpcProviderManager.shutdown,
        isHealthy: typeof rpcProviderManager.isHealthy
      });
    } catch (error) {
      console.error('  ❌ RPC Provider Manager method check failed:', error);
    }
    
    console.log('\n✅ Phase 2 Integration Test Complete');
    
  } catch (error) {
    console.error('\n❌ Phase 2 Integration Test Failed:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
testPhase2Integration().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
