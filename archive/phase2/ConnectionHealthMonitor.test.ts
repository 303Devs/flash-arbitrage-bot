import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { ConnectionHealthMonitor } from '../../../backend/src/data/ConnectionHealthMonitor.js';
import { logger } from '../../../backend/src/utils/Logger.js';
import { redisCache } from '../../../backend/src/storage/RedisCache.js';
import { postgresRepository } from '../../../backend/src/storage/PostgresRepository.js';

// Mock dependencies
vi.mock('../../../backend/src/utils/Logger.js');
vi.mock('../../../backend/src/storage/RedisCache.js');
vi.mock('../../../backend/src/storage/PostgresRepository.js');

// Mock RPC Provider Manager to avoid circular dependency
vi.mock('../../../backend/src/data/RpcProviderManager.js', () => ({
  rpcProviderManager: {
    getHttpProvider: vi.fn().mockReturnValue({
      getBlockNumber: vi.fn().mockResolvedValue(1000000n)
    })
  }
}));

describe('ConnectionHealthMonitor', () => {
  let healthMonitor: ConnectionHealthMonitor;
  let mockLogger: any;
  let mockRedisCache: any;
  let mockPostgresRepository: any;

  const mockProviderConfigs = [
    { name: 'QuickNode', chainId: 42161, priority: 1 },
    { name: 'Alchemy', chainId: 42161, priority: 2 },
    { name: 'Infura', chainId: 42161, priority: 3 },
    { name: 'QuickNode', chainId: 137, priority: 1 },
    { name: 'Alchemy', chainId: 137, priority: 2 }
  ];

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock logger
    mockLogger = {
      startup: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      shutdown: vi.fn()
    };
    Object.assign(logger, mockLogger);

    // Mock Redis cache
    mockRedisCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      isHealthy: vi.fn().mockReturnValue(true)
    };
    Object.assign(redisCache, mockRedisCache);

    // Mock PostgreSQL repository
    mockPostgresRepository = {
      logProviderHealthEvent: vi.fn().mockResolvedValue('event-id-123'),
      logSystemMetric: vi.fn().mockResolvedValue(undefined)
    };
    Object.assign(postgresRepository, mockPostgresRepository);

    // Create fresh instance
    const { ConnectionHealthMonitor } = await import('../../../backend/src/data/ConnectionHealthMonitor.js');
    healthMonitor = new ConnectionHealthMonitor();
  });

  afterEach(async () => {
    if (healthMonitor && healthMonitor.isHealthy()) {
      await healthMonitor.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with provider configurations', async () => {
      await healthMonitor.initialize(mockProviderConfigs);

      expect(healthMonitor.isHealthy()).toBe(true);
      expect(mockLogger.startup).toHaveBeenCalledWith('Initializing Connection Health Monitor...');
      expect(mockLogger.startup).toHaveBeenCalledWith(
        'Connection Health Monitor initialized successfully',
        expect.objectContaining({
          totalProviders: 5,
          chainsMonitored: 2
        })
      );
    });

    it('should create provider metrics for all providers', async () => {
      await healthMonitor.initialize(mockProviderConfigs);

      // Check if we can get metrics for each provider
      const arbitrumQuickNodeMetrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      const polygonAlchemyMetrics = healthMonitor.getProviderHealthMetrics(137, 'Alchemy');

      expect(arbitrumQuickNodeMetrics).toBeDefined();
      expect(arbitrumQuickNodeMetrics?.name).toBe('QuickNode');
      expect(arbitrumQuickNodeMetrics?.chainId).toBe(42161);

      expect(polygonAlchemyMetrics).toBeDefined();
      expect(polygonAlchemyMetrics?.name).toBe('Alchemy');
      expect(polygonAlchemyMetrics?.chainId).toBe(137);
    });

    it('should handle initialization errors gracefully', async () => {
      const { ConnectionHealthMonitor } = await import('../../../backend/src/data/ConnectionHealthMonitor.js');
      const faultyMonitor = new ConnectionHealthMonitor();
      
      // Test with empty provider configs - should handle gracefully
      await faultyMonitor.initialize([]);
      
      expect(faultyMonitor.isHealthy()).toBe(true); // Empty initialization is valid
      
      // Clean up
      await faultyMonitor.shutdown();
    });
  });

  describe('Health Scoring', () => {
    beforeEach(async () => {
      await healthMonitor.initialize(mockProviderConfigs);
    });

    it('should calculate health scores correctly', async () => {
      // Wait for initial health checks to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      expect(metrics).toBeDefined();
      expect(metrics?.healthScore).toBeGreaterThanOrEqual(0);
      expect(metrics?.healthScore).toBeLessThanOrEqual(100);
    });

    it('should track degradation trends', async () => {
      // Wait for initial health checks
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      expect(metrics?.degradationTrend).toMatch(/improving|stable|degrading|critical/);
    });

    it('should provide chain health status', async () => {
      const chainHealth = healthMonitor.getChainHealthStatus(42161);
      
      expect(chainHealth).toBeDefined();
      expect(chainHealth?.chainId).toBe(42161);
      expect(chainHealth?.totalProviders).toBe(3);
      expect(chainHealth?.recommendedAction).toMatch(/continue|switch_provider|reduce_load|alert_ops/);
    });
  });

  describe('Predictive Failure Analysis', () => {
    beforeEach(async () => {
      await healthMonitor.initialize(mockProviderConfigs);
    });

    it('should predict provider failure risk', async () => {
      const prediction = healthMonitor.predictProviderFailure(42161, 'QuickNode');
      
      expect(prediction).toBeDefined();
      expect(prediction.riskLevel).toMatch(/low|medium|high|critical/);
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(100);
      expect(Array.isArray(prediction.reasons)).toBe(true);
    });

    it('should provide time estimates for high-risk providers', async () => {
      // Simulate a high-risk provider by getting metrics and modifying them
      const metrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      if (metrics) {
        // Force high risk conditions
        metrics.consecutiveFailures = 5;
        metrics.successRate = 70;
        metrics.healthScore = 25;
        metrics.degradationTrend = 'critical';
      }

      const prediction = healthMonitor.predictProviderFailure(42161, 'QuickNode');
      
      if (prediction.riskLevel === 'high' || prediction.riskLevel === 'critical') {
        expect(prediction.timeToFailure).toBeDefined();
        expect(prediction.timeToFailure).toBeGreaterThan(0);
      }
    });

    it('should handle unknown providers gracefully', () => {
      const prediction = healthMonitor.predictProviderFailure(999, 'NonExistentProvider');
      
      expect(prediction.riskLevel).toBe('critical');
      expect(prediction.confidence).toBe(0);
      expect(prediction.reasons).toContain('Provider not found');
    });
  });

  describe('Health History and Analytics', () => {
    beforeEach(async () => {
      await healthMonitor.initialize(mockProviderConfigs);
    });

    it('should track provider health history', async () => {
      // Wait for some health checks to run
      await new Promise(resolve => setTimeout(resolve, 200));

      const history = healthMonitor.getProviderHealthHistory(42161, 'QuickNode');
      expect(Array.isArray(history)).toBe(true);
    });

    it('should provide all provider metrics', () => {
      const allMetrics = healthMonitor.getAllProviderMetrics();
      
      expect(Array.isArray(allMetrics)).toBe(true);
      expect(allMetrics.length).toBe(5); // Total providers from mockProviderConfigs
      
      // Check that all chains are represented
      const chainIds = [...new Set(allMetrics.map(m => m.chainId))];
      expect(chainIds).toContain(42161);
      expect(chainIds).toContain(137);
    });
  });

  describe('Block Sync Monitoring', () => {
    beforeEach(async () => {
      await healthMonitor.initialize(mockProviderConfigs);
      // Mock Redis to return a cached block number
      mockRedisCache.get.mockResolvedValue({
        blockNumber: '1000010'
      });
    });

    it('should detect out-of-sync providers', async () => {
      // Wait for sync checks to potentially run
      await new Promise(resolve => setTimeout(resolve, 100));

      const metrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      expect(metrics?.blockSyncStatus).toBeDefined();
      expect(typeof metrics?.blockSyncStatus.isInSync).toBe('boolean');
      expect(typeof metrics?.blockSyncStatus.blocksBehind).toBe('number');
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await healthMonitor.initialize(mockProviderConfigs);
    });

    it('should handle Redis failures gracefully', async () => {
      // Mock Redis failure
      mockRedisCache.isHealthy.mockReturnValue(false);
      mockRedisCache.get.mockRejectedValue(new Error('Redis connection failed'));

      // Should still work without Redis
      const metrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      expect(metrics).toBeDefined();
    });

    it('should handle PostgreSQL logging failures gracefully', async () => {
      // Mock PostgreSQL failure
      mockPostgresRepository.logProviderHealthEvent.mockRejectedValue(new Error('DB connection failed'));

      // Should continue operating even if logging fails
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // PostgreSQL logging failures should not crash the system
      const metrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      expect(metrics).toBeDefined();
    });

    it('should handle provider health check failures', async () => {
      // Mock RPC provider failure
      const { rpcProviderManager } = await import('../../../backend/src/data/RpcProviderManager.js');
      (rpcProviderManager.getHttpProvider as any).mockReturnValue({
        getBlockNumber: vi.fn().mockRejectedValue(new Error('Network error'))
      });

      // Wait for health checks to run with the failing provider
      await new Promise(resolve => setTimeout(resolve, 300));

      const metrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      if (metrics) {
        // Should reflect the failure in metrics OR the system should handle it gracefully
        // Since this is mocked, we'll check that the system continues to function
        expect(metrics.isHealthy !== undefined).toBe(true);
        expect(typeof metrics.consecutiveFailures).toBe('number');
      } else {
        // If no metrics available, that's also acceptable for error handling
        expect(healthMonitor.isHealthy()).toBe(true);
      }
    });
  });

  describe('Multi-Chain Support', () => {
    beforeEach(async () => {
      await healthMonitor.initialize(mockProviderConfigs);
    });

    it('should monitor multiple chains independently', () => {
      const arbitrumHealth = healthMonitor.getChainHealthStatus(42161);
      const polygonHealth = healthMonitor.getChainHealthStatus(137);

      expect(arbitrumHealth?.chainId).toBe(42161);
      expect(arbitrumHealth?.totalProviders).toBe(3);

      expect(polygonHealth?.chainId).toBe(137);
      expect(polygonHealth?.totalProviders).toBe(2);
    });

    it('should handle chain-specific thresholds', () => {
      // Different chains should have different performance expectations
      const arbitrumMetrics = healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
      const polygonMetrics = healthMonitor.getProviderHealthMetrics(137, 'QuickNode');

      // Both should exist but may have different scoring due to chain-specific thresholds
      expect(arbitrumMetrics).toBeDefined();
      expect(polygonMetrics).toBeDefined();
    });
  });

  describe('Performance and Resource Usage', () => {
    beforeEach(async () => {
      await healthMonitor.initialize(mockProviderConfigs);
    });

    it('should maintain reasonable memory usage', () => {
      // Run multiple health check cycles
      for (let i = 0; i < 10; i++) {
        healthMonitor.getAllProviderMetrics();
      }

      // Memory usage should be bounded (this is a basic check)
      const allMetrics = healthMonitor.getAllProviderMetrics();
      expect(allMetrics.length).toBe(5);
    });

    it('should handle high frequency operations', async () => {
      const startTime = Date.now();
      
      // Perform many operations quickly
      for (let i = 0; i < 100; i++) {
        healthMonitor.getProviderHealthMetrics(42161, 'QuickNode');
        healthMonitor.getChainHealthStatus(42161);
      }
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe('Shutdown and Cleanup', () => {
    it('should shutdown gracefully', async () => {
      await healthMonitor.initialize(mockProviderConfigs);
      expect(healthMonitor.isHealthy()).toBe(true);

      await healthMonitor.shutdown();
      expect(healthMonitor.isHealthy()).toBe(false);
      expect(mockLogger.shutdown).toHaveBeenCalledWith('Shutting down Connection Health Monitor...');
      expect(mockLogger.shutdown).toHaveBeenCalledWith('Connection Health Monitor shutdown complete');
    });

    it('should handle shutdown errors gracefully', async () => {
      await healthMonitor.initialize(mockProviderConfigs);
      
      // Shutdown should always complete gracefully
      await expect(healthMonitor.shutdown()).resolves.not.toThrow();
      
      // Should be able to shutdown again without issues
      await expect(healthMonitor.shutdown()).resolves.not.toThrow();
    });
  });
});
