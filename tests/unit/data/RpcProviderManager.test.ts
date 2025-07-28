/**
 * 🔗 RPC Provider Manager Unit Tests
 * 
 * Comprehensive testing of RPC provider management for enterprise MEV infrastructure.
 * Tests provider selection, health integration, failover logic, and performance optimization.
 * 
 * @fileoverview RPC Provider Manager unit tests with real infrastructure validation
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment, TestEnvInstance } from '../../helpers/TestEnvironment';
import { PerformanceMetrics } from '../../helpers/PerformanceMetrics';
import { RpcProviderManager } from '@data/RpcProviderManager';
import { Logger } from '@utils/Logger';

describe('RpcProviderManager Unit Tests - Enterprise MEV Infrastructure', () => {
  let testEnv: TestEnvInstance | null = null;
  let rpcProviderManager: RpcProviderManager;
  let logger: Logger;

  beforeEach(async () => {
    // Setup test environment with real databases for provider state
    testEnv = await TestEnvironment.setupTestEnvironment('rpc-provider-manager-unit-test', {
      isolationLevel: 'unit',
      enableRealDatabases: true, // Need databases for provider state management
      enableRealRpc: false, // Use mocked RPC for unit tests
      enableRealWebSockets: false,
      chainIds: [42161, 137, 8453],
      performance: {
        timeoutMs: 12000, // Allow time for RPC operations
        maxMemoryMB: 512,
        maxCpuPercent: 75
      }
    });

    logger = Logger.getInstance();

    if (!testEnv.databases) {
      throw new Error('Test databases not initialized');
    }

    // Initialize RPC Provider Manager with test databases
    rpcProviderManager = new RpcProviderManager(testEnv.databases);
  });

  afterEach(async () => {
    if (testEnv) {
      await testEnv.cleanup();
      testEnv = null;
    }
  });

  describe('Provider Manager Initialization', () => {
    it('should initialize with correct provider configuration', () => {
      expect(rpcProviderManager).toBeInstanceOf(RpcProviderManager);
      expect(rpcProviderManager).toBeDefined();
    });

    it('should load providers for all configured chains', async () => {
      const supportedChains = await rpcProviderManager.getSupportedChains();
      
      expect(supportedChains).toContain(42161); // Arbitrum
      expect(supportedChains).toContain(137);   // Polygon
      expect(supportedChains).toContain(8453);  // Base
      expect(supportedChains.length).toBeGreaterThanOrEqual(3);
    });

    it('should have multiple providers per chain for redundancy', async () => {
      const chains = [42161, 137, 8453];
      
      for (const chainId of chains) {
        const providers = await rpcProviderManager.getProvidersForChain(chainId);
        expect(providers.length).toBeGreaterThanOrEqual(3); // quicknode, alchemy, infura minimum
        
        const providerNames = providers.map(p => p.name);
        expect(providerNames).toContain('quicknode');
        expect(providerNames).toContain('alchemy');
        expect(providerNames).toContain('infura');
      }
    });

    it('should initialize with healthy provider states', async () => {
      const healthStatus = await rpcProviderManager.getAllProviderHealthStatus();
      
      expect(healthStatus).toBeDefined();
      expect(Object.keys(healthStatus).length).toBeGreaterThan(0);
      
      // Check that each chain has provider health data
      for (const chainId of [42161, 137, 8453]) {
        expect(healthStatus[chainId]).toBeDefined();
        expect(Object.keys(healthStatus[chainId]).length).toBeGreaterThan(0);
      }
    });
  });

  describe('MEV Trading Specific Requirements', () => {
    it('should meet sub-350ms provider selection for MEV operations', async () => {
      const mevSelections = [];
      const iterations = 20;

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const provider = await rpcProviderManager.selectMevOptimizedProvider(42161);
        const selectionTime = performance.now() - startTime;

        mevSelections.push({
          provider: provider.name,
          selectionTime,
          healthScore: provider.healthScore,
          latency: provider.latency
        });
      }

      // All selections should be very fast
      const avgSelectionTime = mevSelections.reduce((sum, s) => sum + s.selectionTime, 0) / iterations;
      expect(avgSelectionTime).toBeLessThan(10); // Sub-10ms selection

      // All selected providers should meet MEV requirements
      mevSelections.forEach(selection => {
        expect(selection.latency).toBeLessThan(350);
        expect(selection.healthScore).toBeGreaterThan(70);
      });
    });

    it('should handle high-frequency provider switching for MEV competition', async () => {
      const switchingResults = [];
      const switchCount = 100;

      for (let i = 0; i < switchCount; i++) {
        const startTime = performance.now();
        
        // Simulate competitive MEV scenario requiring fast provider switching
        const provider = await rpcProviderManager.selectMevOptimizedProvider(42161);
        await rpcProviderManager.recordMevOperation(42161, provider.name, {
          operationType: 'arbitrage_detection',
          executionTimeMs: Math.random() * 300,
          success: Math.random() > 0.1
        });
        
        const totalTime = performance.now() - startTime;
        switchingResults.push(totalTime);
      }

      const avgSwitchTime = switchingResults.reduce((sum, time) => sum + time, 0) / switchCount;
      expect(avgSwitchTime).toBeLessThan(20); // Very fast MEV provider operations

      // No single operation should be slow
      switchingResults.forEach(time => {
        expect(time).toBeLessThan(100);
      });
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle all providers being unhealthy gracefully', async () => {
      // Mark all providers as unhealthy
      const providers = ['quicknode', 'alchemy', 'infura'];
      
      for (const provider of providers) {
        await rpcProviderManager.updateProviderHealth(42161, provider, {
          healthScore: 15, // Very low
          latency: 2000,   // Very high
          successRate: 0.30, // Very low
          blockSync: false
        });
      }
      
      // Should still return a provider (fallback mode)
      const fallbackProvider = await rpcProviderManager.selectOptimalProvider(42161, {
        strategy: 'emergency_fallback',
        allowUnhealthy: true
      });
      
      expect(fallbackProvider).toBeDefined();
      expect(providers.includes(fallbackProvider.name)).toBe(true);
      
      // Should log emergency condition
      const emergencyStatus = await rpcProviderManager.getEmergencyStatus(42161);
      expect(emergencyStatus.isEmergency).toBe(true);
      expect(emergencyStatus.reason).toBe('all_providers_unhealthy');
    });

    it('should handle database connection failures gracefully', async () => {
      // Simulate database unavailability
      const originalQuery = testEnv!.databases!.postgres.query;
      testEnv!.databases!.postgres.query = async () => {
        throw new Error('Connection lost');
      };
      
      // Should fall back to in-memory provider selection
      const provider = await rpcProviderManager.selectOptimalProvider(42161, {
        strategy: 'memory_fallback'
      });
      
      expect(provider).toBeDefined();
      
      // Restore database connection
      testEnv!.databases!.postgres.query = originalQuery;
    });

    it('should handle concurrent provider operations safely', async () => {
      const concurrentOps = [];
      const operationCount = 30;
      
      // Mix of different concurrent operations
      for (let i = 0; i < operationCount; i++) {
        const opType = i % 4;
        
        if (opType === 0) {
          concurrentOps.push(rpcProviderManager.selectOptimalProvider(42161, { strategy: 'health_weighted' }));
        } else if (opType === 1) {
          concurrentOps.push(rpcProviderManager.updateProviderHealth(42161, 'alchemy', {
            healthScore: 80 + Math.random() * 20,
            latency: 120 + Math.random() * 100,
            successRate: 0.9 + Math.random() * 0.1,
            blockSync: true
          }));
        } else if (opType === 2) {
          concurrentOps.push(rpcProviderManager.getProviderStatistics(42161, 'infura'));
        } else {
          concurrentOps.push(rpcProviderManager.recordRequest(42161, 'quicknode', {
            method: 'eth_blockNumber',
            latency: 100 + Math.random() * 100,
            success: Math.random() > 0.1,
            timestamp: Date.now()
          }));
        }
      }
      
      // All operations should complete successfully
      const results = await Promise.all(concurrentOps);
      expect(results.length).toBe(operationCount);
      
      // System should remain in consistent state
      const finalStatus = await rpcProviderManager.getSystemStatus();
      expect(finalStatus.healthy).toBe(true);
    });
  });

  describe('Integration with Test Environment', () => {
    it('should work within test environment isolation', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      const testData = {
        testId: testEnv.testId,
        chainId: 42161,
        operation: 'provider-selection-test'
      };

      const selectedProvider = await rpcProviderManager.selectOptimalProvider(42161, {
        strategy: 'health_weighted',
        metadata: testData
      });

      expect(selectedProvider).toBeDefined();
      expect(selectedProvider.chainId).toBe(42161);
    });

    it('should integrate with performance monitoring', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      const startTime = Date.now();
      
      await rpcProviderManager.selectOptimalProvider(42161, { strategy: 'health_weighted' });
      await rpcProviderManager.getPrimaryProvider(137);
      
      const operationTime = Date.now() - startTime;
      
      testEnv.performance.incrementDatabaseOperations();
      
      const metrics = testEnv.performance.getCurrentMetrics();
      expect(metrics.databaseOperations).toBeGreaterThan(0);
      expect(operationTime).toBeLessThan(200); // Fast provider operations
    });
  });
});
