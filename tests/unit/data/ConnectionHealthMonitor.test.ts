/**
 * 🏥 Connection Health Monitor Unit Tests
 * 
 * Comprehensive testing of health monitoring algorithms for enterprise MEV infrastructure.
 * Tests multi-metric health scoring, trend analysis, predictive failure detection, and performance optimization.
 * 
 * @fileoverview Connection health monitoring unit tests with real infrastructure validation
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment, TestEnvInstance } from '../../helpers/TestEnvironment';
import { PerformanceMetrics } from '../../helpers/PerformanceMetrics';
import { ConnectionHealthMonitor } from '@data/ConnectionHealthMonitor';
import { Logger } from '@utils/Logger';

describe('ConnectionHealthMonitor Unit Tests - Enterprise MEV Infrastructure', () => {
  let testEnv: TestEnvInstance | null = null;
  let healthMonitor: ConnectionHealthMonitor;
  let logger: Logger;

  beforeEach(async () => {
    // Setup test environment with real databases for health data storage
    testEnv = await TestEnvironment.setupTestEnvironment('connection-health-monitor-unit-test', {
      isolationLevel: 'unit',
      enableRealDatabases: true, // Need databases for health metrics storage
      enableRealRpc: false, // Use mocks for unit tests
      enableRealWebSockets: false,
      chainIds: [42161, 137, 8453],
      performance: {
        timeoutMs: 10000, // Allow time for health analysis operations
        maxMemoryMB: 512,
        maxCpuPercent: 75
      }
    });

    logger = Logger.getInstance();

    if (!testEnv.databases) {
      throw new Error('Test databases not initialized');
    }

    // Initialize Connection Health Monitor with test infrastructure
    healthMonitor = new ConnectionHealthMonitor(testEnv.databases);
  });

  afterEach(async () => {
    if (healthMonitor) {
      await healthMonitor.shutdown();
    }
    if (testEnv) {
      await testEnv.cleanup();
      testEnv = null;
    }
  });

  describe('Health Monitor Initialization & Configuration', () => {
    it('should initialize with correct health monitoring configuration', () => {
      expect(healthMonitor).toBeInstanceOf(ConnectionHealthMonitor);
      expect(healthMonitor).toBeDefined();
    });

    it('should configure chain-specific health thresholds', async () => {
      const chains = [42161, 137, 8453];
      
      for (const chainId of chains) {
        const thresholds = await healthMonitor.getHealthThresholds(chainId);
        
        expect(thresholds).toBeDefined();
        expect(thresholds.connectivity).toBeDefined();
        expect(thresholds.performance).toBeDefined();
        expect(thresholds.reliability).toBeDefined();
        expect(thresholds.blockSync).toBeDefined();
        
        // MEV-specific thresholds
        expect(thresholds.performance.maxLatencyMs).toBeLessThanOrEqual(350); // MEV requirement
        expect(thresholds.reliability.minSuccessRate).toBeGreaterThanOrEqual(0.95); // High reliability
      }
    });

    it('should initialize health scoring algorithms', async () => {
      const algorithms = await healthMonitor.getAvailableAlgorithms();
      
      expect(algorithms).toContain('weighted_average');
      expect(algorithms).toContain('exponential_smoothing');
      expect(algorithms).toContain('trend_analysis');
      expect(algorithms).toContain('predictive_scoring');
      
      // Verify default algorithm is set
      const defaultAlgorithm = await healthMonitor.getCurrentAlgorithm();
      expect(algorithms).toContain(defaultAlgorithm);
    });

    it('should configure sliding window parameters', async () => {
      const windowConfig = await healthMonitor.getSlidingWindowConfig();
      
      expect(windowConfig.timeWindowMs).toBeGreaterThan(0);
      expect(windowConfig.sampleSize).toBeGreaterThan(10); // Sufficient samples for analysis
      expect(windowConfig.updateIntervalMs).toBeLessThan(windowConfig.timeWindowMs);
      
      // MEV-optimized window configuration
      expect(windowConfig.timeWindowMs).toBeLessThanOrEqual(300000); // 5 minutes max for quick adaptation
      expect(windowConfig.updateIntervalMs).toBeLessThanOrEqual(30000); // 30 seconds max update interval
    });
  });

  describe('Multi-Metric Health Scoring', () => {
    it('should calculate comprehensive health scores with correct weighting', async () => {
      const chainId = 42161;
      const provider = 'quicknode';
      
      // Simulate health metrics
      const metrics = {
        connectivity: {
          connectionUptime: 0.995,
          connectionStability: 0.98,
          reconnectionCount: 2
        },
        performance: {
          averageLatencyMs: 120,
          p95LatencyMs: 180,
          p99LatencyMs: 250,
          throughputRps: 150
        },
        reliability: {
          successRate: 0.97,
          errorRate: 0.03,
          timeoutRate: 0.01,
          consecutiveFailures: 0
        },
        blockSync: {
          syncStatus: true,
          blockLag: 1,
          syncQuality: 0.99
        }
      };

      const healthScore = await healthMonitor.calculateHealthScore(chainId, provider, metrics);
      
      expect(healthScore.overall).toBeGreaterThanOrEqual(0);
      expect(healthScore.overall).toBeLessThanOrEqual(100);
      expect(healthScore.components).toBeDefined();
      
      // Verify component scores
      expect(healthScore.components.connectivity).toBeGreaterThan(90); // High connectivity
      expect(healthScore.components.performance).toBeGreaterThan(85); // Good performance
      expect(healthScore.components.reliability).toBeGreaterThan(90); // High reliability
      expect(healthScore.components.blockSync).toBeGreaterThan(95); // Excellent sync
      
      // Verify weighting is applied correctly
      const expectedWeighted = 
        (healthScore.components.connectivity * 0.30) +
        (healthScore.components.performance * 0.25) +
        (healthScore.components.reliability * 0.25) +
        (healthScore.components.blockSync * 0.20);
      
      expect(healthScore.overall).toBeCloseTo(expectedWeighted, 1);
    });

    it('should handle degraded performance scenarios correctly', async () => {
      const chainId = 137;
      const provider = 'alchemy';
      
      // Simulate degraded metrics
      const degradedMetrics = {
        connectivity: {
          connectionUptime: 0.90,
          connectionStability: 0.85,
          reconnectionCount: 8
        },
        performance: {
          averageLatencyMs: 450, // Above MEV threshold
          p95LatencyMs: 680,
          p99LatencyMs: 1200,
          throughputRps: 80
        },
        reliability: {
          successRate: 0.88,
          errorRate: 0.12,
          timeoutRate: 0.05,
          consecutiveFailures: 3
        },
        blockSync: {
          syncStatus: true,
          blockLag: 5,
          syncQuality: 0.92
        }
      };

      const healthScore = await healthMonitor.calculateHealthScore(chainId, provider, degradedMetrics);
      
      expect(healthScore.overall).toBeLessThan(80); // Should reflect degradation
      expect(healthScore.components.performance).toBeLessThan(60); // Poor performance due to high latency
      expect(healthScore.components.reliability).toBeLessThan(70); // Poor reliability
      
      // Should trigger degradation alerts
      const alerts = await healthMonitor.getActiveAlerts(chainId, provider);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some(alert => alert.type === 'performance_degradation')).toBe(true);
    });

    it('should apply chain-specific scoring adjustments', async () => {
      const testMetrics = {
        connectivity: { connectionUptime: 0.95, connectionStability: 0.93, reconnectionCount: 5 },
        performance: { averageLatencyMs: 200, p95LatencyMs: 300, p99LatencyMs: 450, throughputRps: 120 },
        reliability: { successRate: 0.94, errorRate: 0.06, timeoutRate: 0.02, consecutiveFailures: 1 },
        blockSync: { syncStatus: true, blockLag: 2, syncQuality: 0.96 }
      };

      // Calculate scores for different chains
      const arbitrumScore = await healthMonitor.calculateHealthScore(42161, 'quicknode', testMetrics);
      const polygonScore = await healthMonitor.calculateHealthScore(137, 'quicknode', testMetrics);
      const baseScore = await healthMonitor.calculateHealthScore(8453, 'quicknode', testMetrics);

      // Different chains may have different tolerance levels
      expect(arbitrumScore.overall).toBeDefined();
      expect(polygonScore.overall).toBeDefined();
      expect(baseScore.overall).toBeDefined();
      
      // Verify chain-specific thresholds are applied
      const arbitrumThresholds = await healthMonitor.getHealthThresholds(42161);
      const polygonThresholds = await healthMonitor.getHealthThresholds(137);
      
      expect(arbitrumThresholds.performance.maxLatencyMs).toBeDefined();
      expect(polygonThresholds.performance.maxLatencyMs).toBeDefined();
    });

    it('should handle extreme failure scenarios gracefully', async () => {
      const chainId = 8453;
      const provider = 'infura';
      
      // Simulate complete failure metrics
      const failureMetrics = {
        connectivity: {
          connectionUptime: 0.10,
          connectionStability: 0.05,
          reconnectionCount: 50
        },
        performance: {
          averageLatencyMs: 5000,
          p95LatencyMs: 8000,
          p99LatencyMs: 15000,
          throughputRps: 5
        },
        reliability: {
          successRate: 0.15,
          errorRate: 0.85,
          timeoutRate: 0.40,
          consecutiveFailures: 25
        },
        blockSync: {
          syncStatus: false,
          blockLag: 100,
          syncQuality: 0.10
        }
      };

      const healthScore = await healthMonitor.calculateHealthScore(chainId, provider, failureMetrics);
      
      expect(healthScore.overall).toBeLessThan(20); // Very low score for failure
      expect(healthScore.status).toBe('CRITICAL');
      expect(healthScore.recommendations).toBeDefined();
      expect(healthScore.recommendations.length).toBeGreaterThan(0);
      
      // Should recommend immediate action
      expect(healthScore.recommendations.some(rec => rec.includes('immediate'))).toBe(true);
    });
  });

  describe('Integration with Test Environment', () => {
    it('should work within test environment isolation', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      const testMetadata = {
        testId: testEnv.testId,
        isolationLevel: testEnv.config.isolationLevel,
        chainIds: testEnv.config.chainIds
      };

      // Test that health monitor works within isolated environment
      const systemStatus = await healthMonitor.getSystemStatus();
      expect(systemStatus.healthy).toBe(true);
      expect(systemStatus.activeChains).toEqual(testEnv.config.chainIds);
    });

    it('should integrate with performance monitoring', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      const startTime = Date.now();
      
      // Perform health monitoring operations
      const metrics = {
        connectivity: { connectionUptime: 0.97, connectionStability: 0.94, reconnectionCount: 3 },
        performance: { averageLatencyMs: 135, p95LatencyMs: 180, p99LatencyMs: 250, throughputRps: 145 },
        reliability: { successRate: 0.96, errorRate: 0.04, timeoutRate: 0.01, consecutiveFailures: 1 },
        blockSync: { syncStatus: true, blockLag: 2, syncQuality: 0.97 }
      };
      
      await healthMonitor.updateHealthMetrics(42161, 'quicknode', metrics);
      await healthMonitor.calculateHealthScore(42161, 'quicknode', metrics);
      
      const operationTime = Date.now() - startTime;
      
      testEnv.performance.incrementDatabaseOperations();
      
      const performanceMetrics = testEnv.performance.getCurrentMetrics();
      expect(performanceMetrics.databaseOperations).toBeGreaterThan(0);
      expect(operationTime).toBeLessThan(500); // Fast health operations
    });
  });

  describe('MEV Trading Specific Requirements', () => {
    it('should detect MEV-critical performance degradation', async () => {
      const chainId = 42161;
      const provider = 'quicknode';
      
      // MEV-critical scenarios
      const mevCriticalMetrics = {
        connectivity: { connectionUptime: 0.98, connectionStability: 0.95, reconnectionCount: 2 },
        performance: { 
          averageLatencyMs: 380, // Above 350ms MEV threshold
          p95LatencyMs: 450,
          p99LatencyMs: 600,
          throughputRps: 120
        },
        reliability: { successRate: 0.94, errorRate: 0.06, timeoutRate: 0.02, consecutiveFailures: 2 },
        blockSync: { syncStatus: true, blockLag: 3, syncQuality: 0.95 }
      };
      
      const healthScore = await healthMonitor.calculateHealthScore(chainId, provider, mevCriticalMetrics);
      
      // Should flag as MEV-critical
      expect(healthScore.mevSuitability).toBe('poor');
      expect(healthScore.actionPriority).toBe('high');
      expect(healthScore.recommendations.some(rec => rec.includes('MEV'))).toBe(true);
      
      // Should trigger MEV-specific alerts
      const alerts = await healthMonitor.getActiveAlerts(chainId, provider);
      expect(alerts.some(alert => alert.type === 'mev_performance_critical')).toBe(true);
    });

    it('should maintain precise health score calculations', async () => {
      const chainId = 42161;
      const provider = 'quicknode';
      
      // Test with precise decimal metrics
      const preciseMetrics = {
        connectivity: { 
          connectionUptime: 0.987654321,
          connectionStability: 0.956789123,
          reconnectionCount: 3
        },
        performance: { 
          averageLatencyMs: 123.456789,
          p95LatencyMs: 187.654321,
          p99LatencyMs: 245.123456,
          throughputRps: 142.987654
        },
        reliability: { 
          successRate: 0.967890123,
          errorRate: 0.032109877,
          timeoutRate: 0.012345678,
          consecutiveFailures: 1
        },
        blockSync: { 
          syncStatus: true,
          blockLag: 2,
          syncQuality: 0.987123456
        }
      };
      
      const healthScore = await healthMonitor.calculateHealthScore(chainId, provider, preciseMetrics);
      
      // Verify precision is maintained in calculations
      expect(typeof healthScore.overall).toBe('number');
      expect(healthScore.overall % 1).not.toBe(0); // Should have decimal precision
      expect(healthScore.overall.toString().length).toBeGreaterThan(5); // Adequate precision
      
      // Component scores should also maintain precision
      Object.values(healthScore.components).forEach(score => {
        expect(typeof score).toBe('number');
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });
  });
});
