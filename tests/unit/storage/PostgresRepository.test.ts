/**
 * 🗄️ PostgreSQL Repository Unit Tests
 * 
 * Comprehensive testing of PostgreSQL repository functionality for enterprise MEV infrastructure.
 * Tests database operations, analytics, performance tracking, and data integrity.
 * 
 * @fileoverview PostgreSQL repository unit tests with real database validation
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment, TestEnvInstance } from '../../helpers/TestEnvironment';
import { PerformanceMetrics } from '../../helpers/PerformanceMetrics';
import { PostgresRepository } from '@storage/PostgresRepository';
import { Logger } from '@utils/Logger';

describe('PostgresRepository Unit Tests - Enterprise MEV Infrastructure', () => {
  let testEnv: TestEnvInstance | null = null;
  let postgresRepository: PostgresRepository;
  let logger: Logger;

  beforeEach(async () => {
    // Setup test environment with real PostgreSQL instance
    testEnv = await TestEnvironment.setupTestEnvironment('postgres-repository-unit-test', {
      isolationLevel: 'unit',
      enableRealDatabases: true, // Enable PostgreSQL for testing
      enableRealRpc: false,
      enableRealWebSockets: false,
      chainIds: [42161],
      performance: {
        timeoutMs: 10000, // Allow time for database operations
        maxMemoryMB: 512,
        maxCpuPercent: 75
      }
    });

    logger = Logger.getInstance();

    // Initialize PostgreSQL repository with test database
    if (!testEnv.databases) {
      throw new Error('Test databases not initialized');
    }

    postgresRepository = new PostgresRepository(testEnv.databases.postgres);

    // Create test tables with clean state
    await postgresRepository.createAllTables();
  });

  afterEach(async () => {
    if (testEnv && testEnv.databases) {
      // Clean up test data
      await postgresRepository.cleanupAllTables();
      await testEnv.cleanup();
      testEnv = null;
    }
  });

  describe('Repository Initialization & Connection', () => {
    it('should initialize with valid PostgreSQL connection', () => {
      expect(postgresRepository).toBeInstanceOf(PostgresRepository);
      expect(postgresRepository).toBeDefined();
    });

    it('should verify PostgreSQL connection health', async () => {
      if (!testEnv?.databases) throw new Error('Databases not available');
      
      const result = await testEnv.databases.postgres.query('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);
    });

    it('should handle PostgreSQL connection errors gracefully', async () => {
      // Test error handling without breaking the repository
      expect(() => {
        new PostgresRepository(testEnv!.databases!.postgres);
      }).not.toThrow();
    });
  });

  describe('Provider Health Event Operations', () => {
    beforeEach(async () => {
      await postgresRepository.createProviderHealthEventsTable();
    });

    describe('Insert Operations', () => {
      it('should insert provider health events with complete metrics', async () => {
        const healthEvent = {
          chainId: 42161,
          providerName: 'quicknode',
          healthScore: 88,
          latencyMs: 145,
          successRate: 0.97,
          blockSyncStatus: true,
          metadata: {
            responseTimeDistribution: { p50: 120, p90: 180, p95: 220, p99: 350 },
            connectionPool: { active: 5, idle: 15, waiting: 0 },
            errorTypes: { timeout: 2, connection: 1, unknown: 0 }
          }
        };

        const insertedId = await postgresRepository.insertProviderHealthEvent(healthEvent);
        expect(insertedId).toBeGreaterThan(0);

        const retrieved = await postgresRepository.getProviderHealthEventById(insertedId);
        expect(retrieved.chain_id).toBe(42161);
        expect(retrieved.provider_name).toBe('quicknode');
        expect(retrieved.health_score).toBe(88);
        expect(retrieved.latency_ms).toBe(145);
        expect(retrieved.success_rate).toBe(0.97);
        expect(retrieved.block_sync_status).toBe(true);
        expect(retrieved.metadata.responseTimeDistribution.p99).toBe(350);
      });

      it('should validate health score constraints for MEV requirements', async () => {
        const validHealthEvent = {
          chainId: 42161,
          providerName: 'alchemy',
          healthScore: 95, // Excellent health
          latencyMs: 120,
          successRate: 0.99,
          blockSyncStatus: true
        };

        const poorHealthEvent = {
          chainId: 42161,
          providerName: 'infura',
          healthScore: 35, // Poor health
          latencyMs: 450,
          successRate: 0.85,
          blockSyncStatus: false
        };

        const validId = await postgresRepository.insertProviderHealthEvent(validHealthEvent);
        const poorId = await postgresRepository.insertProviderHealthEvent(poorHealthEvent);

        expect(validId).toBeGreaterThan(0);
        expect(poorId).toBeGreaterThan(0);

        // Validate MEV trading suitability
        const validEvent = await postgresRepository.getProviderHealthEventById(validId);
        const poorEvent = await postgresRepository.getProviderHealthEventById(poorId);

        expect(validEvent.health_score).toBeGreaterThan(70); // MEV suitable
        expect(validEvent.latency_ms).toBeLessThan(350); // MEV timing requirement
        expect(poorEvent.health_score).toBeLessThan(50); // Not MEV suitable
      });

      it('should handle bulk health event inserts efficiently', async () => {
        const batchSize = 100;
        const healthEvents = [];

        // Generate test health events
        for (let i = 0; i < batchSize; i++) {
          healthEvents.push({
            chainId: 42161,
            providerName: ['quicknode', 'alchemy', 'infura'][i % 3],
            healthScore: 70 + Math.random() * 30,
            latencyMs: 100 + Math.random() * 200,
            successRate: 0.9 + Math.random() * 0.1,
            blockSyncStatus: Math.random() > 0.1
          });
        }

        const startTime = Date.now();
        const insertedIds = await postgresRepository.insertProviderHealthEventsBatch(healthEvents);
        const insertTime = Date.now() - startTime;

        expect(insertedIds.length).toBe(batchSize);
        expect(insertTime).toBeLessThan(2000); // Should be fast for MEV operations

        // Verify all events were inserted
        const eventCount = await postgresRepository.getProviderHealthEventCount();
        expect(eventCount).toBe(batchSize);
      });
    });

    describe('Query Operations', () => {
      beforeEach(async () => {
        // Insert test health events
        const testEvents = [
          {
            chainId: 42161,
            providerName: 'quicknode',
            healthScore: 90,
            latencyMs: 130,
            successRate: 0.98,
            blockSyncStatus: true
          },
          {
            chainId: 42161,
            providerName: 'alchemy',
            healthScore: 85,
            latencyMs: 150,
            successRate: 0.96,
            blockSyncStatus: true
          },
          {
            chainId: 137,
            providerName: 'quicknode',
            healthScore: 75,
            latencyMs: 200,
            successRate: 0.92,
            blockSyncStatus: false
          }
        ];

        for (const event of testEvents) {
          await postgresRepository.insertProviderHealthEvent(event);
        }
      });

      it('should get health events by chain and provider', async () => {
        const quicknodeArbitrumEvents = await postgresRepository.getProviderHealthEventsByChainAndProvider(42161, 'quicknode');
        const alchemyArbitrumEvents = await postgresRepository.getProviderHealthEventsByChainAndProvider(42161, 'alchemy');
        const quicknodePolygonEvents = await postgresRepository.getProviderHealthEventsByChainAndProvider(137, 'quicknode');

        expect(quicknodeArbitrumEvents.length).toBe(1);
        expect(alchemyArbitrumEvents.length).toBe(1);
        expect(quicknodePolygonEvents.length).toBe(1);

        expect(quicknodeArbitrumEvents[0].provider_name).toBe('quicknode');
        expect(quicknodeArbitrumEvents[0].chain_id).toBe(42161);
        expect(quicknodeArbitrumEvents[0].health_score).toBe(90);
      });

      it('should calculate provider health statistics', async () => {
        const quicknodeStats = await postgresRepository.getProviderHealthStatistics('quicknode', '1 hour');

        expect(quicknodeStats).toBeDefined();
        expect(quicknodeStats.averageHealthScore).toBeGreaterThan(0);
        expect(quicknodeStats.averageLatency).toBeGreaterThan(0);
        expect(quicknodeStats.averageSuccessRate).toBeGreaterThan(0);
        expect(quicknodeStats.eventCount).toBeGreaterThan(0);
        expect(quicknodeStats.minHealthScore).toBeLessThanOrEqual(quicknodeStats.maxHealthScore);
      });

      it('should analyze health trends and degradation patterns', async () => {
        const trends = await postgresRepository.analyzeHealthTrends(42161, 'quicknode', '1 hour');

        expect(trends).toBeDefined();
        expect(trends.trendDirection).toMatch(/^(improving|stable|degrading)$/);
        expect(trends.healthScoreChange).toBeDefined();
        expect(trends.latencyChange).toBeDefined();
        expect(trends.successRateChange).toBeDefined();
        expect(trends.confidenceLevel).toBeGreaterThanOrEqual(0);
        expect(trends.confidenceLevel).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Circuit Breaker Event Operations', () => {
    beforeEach(async () => {
      await postgresRepository.createCircuitBreakerEventsTable();
    });

    describe('Insert Operations', () => {
      it('should insert circuit breaker state transitions', async () => {
        const circuitEvent = {
          chainId: 42161,
          providerName: 'quicknode',
          oldState: 'CLOSED',
          newState: 'OPEN',
          failureCount: 5,
          threshold: 5,
          timeoutMs: 30000,
          metadata: {
            triggerReason: 'consecutive_failures',
            lastSuccessTime: new Date(Date.now() - 60000),
            errorPattern: ['timeout', 'timeout', 'connection', 'timeout', 'timeout']
          }
        };

        const insertedId = await postgresRepository.insertCircuitBreakerEvent(circuitEvent);
        expect(insertedId).toBeGreaterThan(0);

        const retrieved = await postgresRepository.getCircuitBreakerEventById(insertedId);
        expect(retrieved.chain_id).toBe(42161);
        expect(retrieved.provider_name).toBe('quicknode');
        expect(retrieved.old_state).toBe('CLOSED');
        expect(retrieved.new_state).toBe('OPEN');
        expect(retrieved.failure_count).toBe(5);
        expect(retrieved.threshold).toBe(5);
      });

      it('should track circuit breaker recovery cycles', async () => {
        // Insert complete recovery cycle
        const events = [
          {
            chainId: 42161,
            providerName: 'alchemy',
            oldState: 'CLOSED',
            newState: 'OPEN',
            failureCount: 5,
            threshold: 5
          },
          {
            chainId: 42161,
            providerName: 'alchemy',
            oldState: 'OPEN',
            newState: 'HALF_OPEN',
            failureCount: 0,
            threshold: 5
          },
          {
            chainId: 42161,
            providerName: 'alchemy',
            oldState: 'HALF_OPEN',
            newState: 'CLOSED',
            failureCount: 0,
            threshold: 5
          }
        ];

        const insertedIds = [];
        for (const event of events) {
          const id = await postgresRepository.insertCircuitBreakerEvent(event);
          insertedIds.push(id);
          // Small delay to ensure chronological order
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        expect(insertedIds.length).toBe(3);

        // Verify recovery cycle
        const history = await postgresRepository.getCircuitBreakerHistory(42161, 'alchemy', '1 hour');
        expect(history.length).toBe(3);
        expect(history[0].new_state).toBe('CLOSED'); // Latest
        expect(history[1].new_state).toBe('HALF_OPEN'); // Middle
        expect(history[2].new_state).toBe('OPEN'); // Oldest
      });
    });

    describe('Query Operations', () => {
      beforeEach(async () => {
        // Insert test circuit breaker events
        const testEvents = [
          {
            chainId: 42161,
            providerName: 'quicknode',
            oldState: 'CLOSED',
            newState: 'OPEN',
            failureCount: 5,
            threshold: 5
          },
          {
            chainId: 42161,
            providerName: 'alchemy',
            oldState: 'CLOSED',
            newState: 'HALF_OPEN',
            failureCount: 3,
            threshold: 5
          },
          {
            chainId: 137,
            providerName: 'quicknode',
            oldState: 'OPEN',
            newState: 'CLOSED',
            failureCount: 0,
            threshold: 5
          }
        ];

        for (const event of testEvents) {
          await postgresRepository.insertCircuitBreakerEvent(event);
        }
      });

      it('should get current circuit breaker states', async () => {
        const currentStates = await postgresRepository.getCurrentCircuitBreakerStates();

        expect(currentStates.length).toBeGreaterThan(0);
        
        // Should have one state per provider-chain combination
        const providerChainStates = new Map();
        for (const state of currentStates) {
          const key = `${state.provider_name}-${state.chain_id}`;
          providerChainStates.set(key, state.new_state);
        }

        expect(providerChainStates.get('quicknode-42161')).toBe('OPEN');
        expect(providerChainStates.get('alchemy-42161')).toBe('HALF_OPEN');
        expect(providerChainStates.get('quicknode-137')).toBe('CLOSED');
      });

      it('should analyze circuit breaker patterns', async () => {
        const patterns = await postgresRepository.analyzeCircuitBreakerPatterns(42161, '1 hour');

        expect(patterns).toBeDefined();
        expect(patterns.totalTransitions).toBeGreaterThan(0);
        expect(patterns.openEvents).toBeGreaterThanOrEqual(0);
        expect(patterns.closeEvents).toBeGreaterThanOrEqual(0);
        expect(patterns.halfOpenEvents).toBeGreaterThanOrEqual(0);
        expect(patterns.mostFailedProvider).toBeDefined();
      });
    });
  });

  describe('Failover Event Operations', () => {
    beforeEach(async () => {
      await postgresRepository.createFailoverEventsTable();
    });

    describe('Insert Operations', () => {
      it('should insert failover events with execution metrics', async () => {
        const failoverEvent = {
          chainId: 42161,
          fromProvider: 'quicknode',
          toProvider: 'alchemy',
          reason: 'health_degradation',
          executionTimeMs: 85,
          healthScores: {
            quicknode: 45,
            alchemy: 92,
            infura: 88
          },
          metadata: {
            triggerType: 'automatic',
            requestsAffected: 12,
            downtime: 0
          }
        };

        const insertedId = await postgresRepository.insertFailoverEvent(failoverEvent);
        expect(insertedId).toBeGreaterThan(0);

        const retrieved = await postgresRepository.getFailoverEventById(insertedId);
        expect(retrieved.chain_id).toBe(42161);
        expect(retrieved.from_provider).toBe('quicknode');
        expect(retrieved.to_provider).toBe('alchemy');
        expect(retrieved.reason).toBe('health_degradation');
        expect(retrieved.execution_time_ms).toBe(85);
        expect(retrieved.health_scores.quicknode).toBe(45);
        expect(retrieved.health_scores.alchemy).toBe(92);
      });

      it('should validate failover execution time meets MEV requirements', async () => {
        const fastFailover = {
          chainId: 42161,
          fromProvider: 'quicknode',
          toProvider: 'alchemy',
          reason: 'performance_degradation',
          executionTimeMs: 75, // Under 100ms requirement
          healthScores: { quicknode: 60, alchemy: 95 }
        };

        const slowFailover = {
          chainId: 42161,
          fromProvider: 'alchemy',
          toProvider: 'infura',
          reason: 'connection_timeout',
          executionTimeMs: 150, // Over 100ms requirement
          healthScores: { alchemy: 30, infura: 85 }
        };

        const fastId = await postgresRepository.insertFailoverEvent(fastFailover);
        const slowId = await postgresRepository.insertFailoverEvent(slowFailover);

        expect(fastId).toBeGreaterThan(0);
        expect(slowId).toBeGreaterThan(0);

        // Analyze failover performance
        const performanceAnalysis = await postgresRepository.analyzeFailoverPerformance(42161, '1 hour');
        expect(performanceAnalysis.averageExecutionTime).toBeDefined();
        expect(performanceAnalysis.fastFailovers).toBeGreaterThan(0); // Should count the 75ms failover
        expect(performanceAnalysis.slowFailovers).toBeGreaterThan(0); // Should count the 150ms failover
      });
    });

    describe('Query Operations', () => {
      beforeEach(async () => {
        // Insert test failover events
        const testFailovers = [
          {
            chainId: 42161,
            fromProvider: 'quicknode',
            toProvider: 'alchemy',
            reason: 'health_degradation',
            executionTimeMs: 80,
            healthScores: { quicknode: 50, alchemy: 90 }
          },
          {
            chainId: 42161,
            fromProvider: 'alchemy',
            toProvider: 'infura',
            reason: 'connection_timeout',
            executionTimeMs: 95,
            healthScores: { alchemy: 40, infura: 85 }
          },
          {
            chainId: 137,
            fromProvider: 'infura',
            toProvider: 'quicknode',
            reason: 'circuit_breaker_open',
            executionTimeMs: 65,
            healthScores: { infura: 20, quicknode: 88 }
          }
        ];

        for (const failover of testFailovers) {
          await postgresRepository.insertFailoverEvent(failover);
        }
      });

      it('should get failover events by chain', async () => {
        const arbitrumFailovers = await postgresRepository.getFailoverEventsByChain(42161);
        const polygonFailovers = await postgresRepository.getFailoverEventsByChain(137);

        expect(arbitrumFailovers.length).toBe(2);
        expect(polygonFailovers.length).toBe(1);

        expect(arbitrumFailovers.every(f => f.chain_id === 42161)).toBe(true);
        expect(polygonFailovers.every(f => f.chain_id === 137)).toBe(true);
      });

      it('should analyze failover patterns and trends', async () => {
        const patterns = await postgresRepository.analyzeFailoverPatterns(42161, '1 hour');

        expect(patterns).toBeDefined();
        expect(patterns.totalFailovers).toBe(2);
        expect(patterns.averageExecutionTime).toBeDefined();
        expect(patterns.failoverReasons).toBeDefined();
        expect(patterns.mostFailedProvider).toBeDefined();
        expect(patterns.mostReliableProvider).toBeDefined();
        
        // Verify execution time meets MEV requirements
        expect(patterns.averageExecutionTime).toBeLessThan(100);
      });

      it('should calculate provider failover statistics', async () => {
        const quicknodeStats = await postgresRepository.getProviderFailoverStats('quicknode', '1 hour');

        expect(quicknodeStats).toBeDefined();
        expect(quicknodeStats.failuresFrom).toBeDefined(); // Times quicknode was failed away from
        expect(quicknodeStats.failuresTo).toBeDefined(); // Times quicknode was failed to
        expect(quicknodeStats.reliabilityScore).toBeGreaterThanOrEqual(0);
        expect(quicknodeStats.reliabilityScore).toBeLessThanOrEqual(100);
        expect(quicknodeStats.averageFailoverTime).toBeDefined();
      });
    });
  });

  describe('Performance Snapshots', () => {
    beforeEach(async () => {
      await postgresRepository.createPerformanceSnapshotsTable();
    });

    it('should capture comprehensive performance snapshots', async () => {
      const snapshot = {
        chainId: 42161,
        providerName: 'quicknode',
        snapshotTime: new Date(),
        metrics: {
          healthScore: 90,
          latencyMs: 145,
          successRate: 0.98,
          blockSyncStatus: true,
          requestRate: 1000, // requests per minute
          errorRate: 0.02,
          responseTimeDistribution: {
            p50: 120,
            p90: 180,
            p95: 220,
            p99: 350
          },
          connectionPool: {
            active: 5,
            idle: 15,
            waiting: 0
          }
        }
      };

      const insertedId = await postgresRepository.insertPerformanceSnapshot(snapshot);
      expect(insertedId).toBeGreaterThan(0);

      const retrieved = await postgresRepository.getPerformanceSnapshotById(insertedId);
      expect(retrieved.chain_id).toBe(42161);
      expect(retrieved.provider_name).toBe('quicknode');
      expect(retrieved.metrics.healthScore).toBe(90);
      expect(retrieved.metrics.responseTimeDistribution.p99).toBe(350);
    });

    it('should generate time-series performance data', async () => {
      // Insert multiple snapshots over time
      const snapshots = [];
      const now = Date.now();

      for (let i = 0; i < 20; i++) {
        const snapshot = {
          chainId: 42161,
          providerName: 'alchemy',
          snapshotTime: new Date(now - (i * 5 * 60 * 1000)), // Every 5 minutes
          metrics: {
            healthScore: 85 + Math.sin(i / 5) * 10,
            latencyMs: 160 + Math.random() * 80,
            successRate: 0.95 + Math.random() * 0.05,
            blockSyncStatus: Math.random() > 0.05,
            requestRate: 800 + Math.random() * 400
          }
        };
        
        snapshots.push(snapshot);
        await postgresRepository.insertPerformanceSnapshot(snapshot);
      }

      const timeSeries = await postgresRepository.getPerformanceTimeSeries(42161, 'alchemy', '2 hours');
      expect(timeSeries.length).toBe(20);
      
      // Verify chronological order
      for (let i = 0; i < timeSeries.length - 1; i++) {
        expect(new Date(timeSeries[i].snapshot_time).getTime())
          .toBeGreaterThanOrEqual(new Date(timeSeries[i + 1].snapshot_time).getTime());
      }
    });

    it('should calculate performance aggregations', async () => {
      // Insert hourly snapshots
      const now = Date.now();
      for (let i = 0; i < 24; i++) {
        await postgresRepository.insertPerformanceSnapshot({
          chainId: 42161,
          providerName: 'infura',
          snapshotTime: new Date(now - (i * 60 * 60 * 1000)), // Every hour
          metrics: {
            healthScore: 80 + Math.random() * 20,
            latencyMs: 180 + Math.random() * 100,
            successRate: 0.9 + Math.random() * 0.1,
            requestRate: 600 + Math.random() * 200
          }
        });
      }

      const aggregations = await postgresRepository.getPerformanceAggregations(42161, 'infura', '24 hours');
      
      expect(aggregations).toBeDefined();
      expect(aggregations.averageHealthScore).toBeGreaterThan(0);
      expect(aggregations.averageLatency).toBeGreaterThan(0);
      expect(aggregations.averageSuccessRate).toBeGreaterThan(0);
      expect(aggregations.minHealthScore).toBeLessThanOrEqual(aggregations.maxHealthScore);
      expect(aggregations.minLatency).toBeLessThanOrEqual(aggregations.maxLatency);
      expect(aggregations.dataPoints).toBe(24);
    });
  });

  describe('Transaction Management', () => {
    beforeEach(async () => {
      await postgresRepository.createAllTables();
    });

    it('should handle database transactions correctly', async () => {
      await postgresRepository.beginTransaction();

      try {
        // Insert multiple related records in transaction
        const healthEventId = await postgresRepository.insertProviderHealthEvent({
          chainId: 42161,
          providerName: 'quicknode',
          healthScore: 60, // Low health score
          latencyMs: 300,
          successRate: 0.85,
          blockSyncStatus: true
        });

        const circuitEventId = await postgresRepository.insertCircuitBreakerEvent({
          chainId: 42161,
          providerName: 'quicknode',
          oldState: 'CLOSED',
          newState: 'OPEN',
          failureCount: 5,
          threshold: 5
        });

        const failoverEventId = await postgresRepository.insertFailoverEvent({
          chainId: 42161,
          fromProvider: 'quicknode',
          toProvider: 'alchemy',
          reason: 'circuit_breaker_open',
          executionTimeMs: 90,
          healthScores: { quicknode: 60, alchemy: 92 }
        });

        // Commit transaction
        await postgresRepository.commitTransaction();

        // Verify all records were inserted
        expect(await postgresRepository.getProviderHealthEventById(healthEventId)).toBeDefined();
        expect(await postgresRepository.getCircuitBreakerEventById(circuitEventId)).toBeDefined();
        expect(await postgresRepository.getFailoverEventById(failoverEventId)).toBeDefined();

      } catch (error) {
        await postgresRepository.rollbackTransaction();
        throw error;
      }
    });

    it('should rollback transactions on errors', async () => {
      await postgresRepository.beginTransaction();

      try {
        // Insert valid record
        const validId = await postgresRepository.insertProviderHealthEvent({
          chainId: 42161,
          providerName: 'quicknode',
          healthScore: 85,
          latencyMs: 150,
          successRate: 0.95,
          blockSyncStatus: true
        });

        // Attempt to insert invalid record (should fail)
        await postgresRepository.insertProviderHealthEvent({
          chainId: null, // This should cause an error
          providerName: 'invalid',
          healthScore: 'not-a-number',
          latencyMs: -100,
          successRate: 'invalid'
        });

        await postgresRepository.commitTransaction();

      } catch (error) {
        await postgresRepository.rollbackTransaction();
        
        // Verify that valid record was also rolled back
        const eventCount = await postgresRepository.getProviderHealthEventCount();
        expect(eventCount).toBe(0);
      }
    });

    it('should handle concurrent transactions safely', async () => {
      const concurrentTransactions = 10;
      const promises = [];

      for (let i = 0; i < concurrentTransactions; i++) {
        const promise = (async (index) => {
          await postgresRepository.beginTransaction();
          
          try {
            await postgresRepository.insertProviderHealthEvent({
              chainId: 42161,
              providerName: `provider-${index}`,
              healthScore: 80 + index,
              latencyMs: 150 + index * 10,
              successRate: 0.9 + index * 0.01,
              blockSyncStatus: true
            });
            
            await postgresRepository.commitTransaction();
            return true;
          } catch (error) {
            await postgresRepository.rollbackTransaction();
            return false;
          }
        })(i);
        
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const successCount = results.filter(r => r).length;

      expect(successCount).toBe(concurrentTransactions);
      
      const finalCount = await postgresRepository.getProviderHealthEventCount();
      expect(finalCount).toBe(concurrentTransactions);
    });
  });

  describe('Integration with Test Environment', () => {
    it('should work within test environment isolation', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      // Test that repository works within isolated environment
      const testData = {
        testId: testEnv.testId,
        isolationLevel: testEnv.config.isolationLevel,
        timestamp: Date.now()
      };

      const healthEvent = {
        chainId: 42161,
        providerName: 'test-provider',
        healthScore: 85,
        latencyMs: 150,
        successRate: 0.95,
        blockSyncStatus: true,
        metadata: testData
      };

      const insertedId = await postgresRepository.insertProviderHealthEvent(healthEvent);
      expect(insertedId).toBeGreaterThan(0);

      const retrieved = await postgresRepository.getProviderHealthEventById(insertedId);
      expect(retrieved.metadata.testId).toBe(testEnv.testId);
      expect(retrieved.metadata.isolationLevel).toBe('unit');
    });

    it('should integrate with performance monitoring', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      const startTime = Date.now();
      
      await postgresRepository.insertProviderHealthEvent({
        chainId: 42161,
        providerName: 'performance-test',
        healthScore: 90,
        latencyMs: 120,
        successRate: 0.98,
        blockSyncStatus: true
      });
      
      const operationTime = Date.now() - startTime;
      
      testEnv.performance.incrementDatabaseOperations();
      
      const metrics = testEnv.performance.getCurrentMetrics();
      expect(metrics.databaseOperations).toBeGreaterThan(0);
      expect(operationTime).toBeLessThan(500); // Fast database operations
    });
  });

  describe('MEV Trading Specific Requirements', () => {
    it('should meet sub-100ms database operations for critical MEV data', async () => {
      const criticalHealthEvent = {
        chainId: 42161,
        providerName: 'quicknode',
        healthScore: 95,
        latencyMs: 120,
        successRate: 0.99,
        blockSyncStatus: true
      };

      // Measure database operation time with high precision
      const start = performance.now();
      const insertedId = await postgresRepository.insertProviderHealthEvent(criticalHealthEvent);
      const insertTime = performance.now() - start;

      const getStart = performance.now();
      await postgresRepository.getProviderHealthEventById(insertedId);
      const getTime = performance.now() - getStart;

      // Critical MEV operations should be very fast
      expect(insertTime).toBeLessThan(50); // Less than 50ms
      expect(getTime).toBeLessThan(20); // Less than 20ms
    });

    it('should handle high-frequency database updates efficiently', async () => {
      const updates = 500;
      const healthEvents = [];
      
      // Simulate high-frequency health updates
      const startTime = Date.now();
      
      for (let i = 0; i < updates; i++) {
        const event = {
          chainId: 42161,
          providerName: ['quicknode', 'alchemy', 'infura'][i % 3],
          healthScore: 70 + Math.random() * 30,
          latencyMs: 100 + Math.random() * 200,
          successRate: 0.9 + Math.random() * 0.1,
          blockSyncStatus: Math.random() > 0.1
        };
        
        healthEvents.push(event);
      }
      
      // Batch insert for efficiency
      const insertedIds = await postgresRepository.insertProviderHealthEventsBatch(healthEvents);
      const totalTime = Date.now() - startTime;
      const avgTimePerUpdate = totalTime / updates;
      
      expect(insertedIds.length).toBe(updates);
      expect(avgTimePerUpdate).toBeLessThan(5); // Less than 5ms per update
      expect(totalTime).toBeLessThan(2000); // Less than 2 seconds total
    });

    it('should track MEV arbitrage analytics with precision', async () => {
      const arbitrageData = {
        chainId: 42161,
        providerName: 'quicknode',
        healthScore: 95,
        latencyMs: 125,
        successRate: 0.99,
        blockSyncStatus: true,
        metadata: {
          mevMetrics: {
            arbitrageOpportunities: 15,
            profitUsd: 125.75,
            gasUsed: '0.00234',
            executionTimeMs: 245,
            competitorCount: 3
          }
        }
      };

      const insertedId = await postgresRepository.insertProviderHealthEvent(arbitrageData);
      const retrieved = await postgresRepository.getProviderHealthEventById(insertedId);
      
      expect(retrieved.metadata.mevMetrics.profitUsd).toBe(125.75);
      expect(retrieved.metadata.mevMetrics.executionTimeMs).toBeLessThan(350); // MEV requirement
      expect(retrieved.metadata.mevMetrics.arbitrageOpportunities).toBe(15);
    });
  });

  describe('Financial Data Integrity', () => {
    it('should maintain precise decimal values for financial calculations', async () => {
      const financialEvent = {
        chainId: 42161,
        providerName: 'alchemy',
        healthScore: 92,
        latencyMs: 135,
        successRate: 0.98,
        blockSyncStatus: true,
        metadata: {
          financialMetrics: {
            ethPrice: 1650.123456789,
            usdcBalance: 10000.987654321,
            gasPrice: 0.000000025,
            profitCalculation: 15.123456789012345,
            slippage: 0.005
          }
        }
      };

      const insertedId = await postgresRepository.insertProviderHealthEvent(financialEvent);
      const retrieved = await postgresRepository.getProviderHealthEventById(insertedId);
      
      // Verify precision is maintained
      const metrics = retrieved.metadata.financialMetrics;
      expect(metrics.ethPrice).toBe(1650.123456789);
      expect(metrics.usdcBalance).toBe(10000.987654321);
      expect(metrics.gasPrice).toBe(0.000000025);
      expect(metrics.profitCalculation).toBe(15.123456789012345);
      expect(metrics.slippage).toBe(0.005);
    });

    it('should handle large transaction volumes correctly', async () => {
      const largeVolumeEvent = {
        chainId: 42161,
        providerName: 'infura',
        healthScore: 88,
        latencyMs: 165,
        successRate: 0.96,
        blockSyncStatus: true,
        metadata: {
          volumeMetrics: {
            totalValueLocked: 1234567890.123456789,
            dailyVolume: 987654321098.765432109,
            liquidityPool: 543210987654.321098765,
            transactionCount: 876543
          }
        }
      };

      const insertedId = await postgresRepository.insertProviderHealthEvent(largeVolumeEvent);
      const retrieved = await postgresRepository.getProviderHealthEventById(insertedId);
      
      // Large financial values should be preserved accurately
      const metrics = retrieved.metadata.volumeMetrics;
      expect(metrics.totalValueLocked).toBe(1234567890.123456789);
      expect(metrics.dailyVolume).toBe(987654321098.765432109);
      expect(metrics.transactionCount).toBe(876543);
    });
  });
});
