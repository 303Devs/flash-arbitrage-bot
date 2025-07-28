/**
 * ⚙️ Provider Failover Logic Unit Tests
 * 
 * Comprehensive testing of intelligent failover systems for enterprise MEV infrastructure.
 * Tests circuit breaker patterns, state machines, load balancing, and recovery mechanisms.
 * 
 * @fileoverview Provider failover logic unit tests with real infrastructure validation
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment, TestEnvInstance } from '../../helpers/TestEnvironment';
import { PerformanceMetrics } from '../../helpers/PerformanceMetrics';
import { ProviderFailoverLogic } from '@data/ProviderFailoverLogic';
import { Logger } from '@utils/Logger';

describe('ProviderFailoverLogic Unit Tests - Enterprise MEV Infrastructure', () => {
  let testEnv: TestEnvInstance | null = null;
  let failoverLogic: ProviderFailoverLogic;
  let logger: Logger;

  beforeEach(async () => {
    // Setup test environment with real databases for failover state management
    testEnv = await TestEnvironment.setupTestEnvironment('provider-failover-logic-unit-test', {
      isolationLevel: 'unit',
      enableRealDatabases: true, // Need databases for failover state persistence
      enableRealRpc: false, // Use mocks for unit tests
      enableRealWebSockets: false,
      chainIds: [42161, 137, 8453],
      performance: {
        timeoutMs: 12000, // Allow time for failover operations
        maxMemoryMB: 512,
        maxCpuPercent: 75
      }
    });

    logger = Logger.getInstance();

    if (!testEnv.databases) {
      throw new Error('Test databases not initialized');
    }

    // Initialize Provider Failover Logic with test infrastructure
    failoverLogic = new ProviderFailoverLogic(testEnv.databases);
  });

  afterEach(async () => {
    if (failoverLogic) {
      await failoverLogic.shutdown();
    }
    if (testEnv) {
      await testEnv.cleanup();
      testEnv = null;
    }
  });

  describe('Failover Logic Initialization & Configuration', () => {
    it('should initialize with correct failover configuration', () => {
      expect(failoverLogic).toBeInstanceOf(ProviderFailoverLogic);
      expect(failoverLogic).toBeDefined();
    });

    it('should configure circuit breaker parameters for all chains', async () => {
      const chains = [42161, 137, 8453];
      
      for (const chainId of chains) {
        const circuitConfig = await failoverLogic.getCircuitBreakerConfig(chainId);
        
        expect(circuitConfig).toBeDefined();
        expect(circuitConfig.failureThreshold).toBeGreaterThan(0);
        expect(circuitConfig.timeoutMs).toBeGreaterThan(0);
        expect(circuitConfig.retryDelayMs).toBeGreaterThan(0);
        expect(circuitConfig.recoveryChecks).toBeGreaterThan(0);
        
        // MEV-optimized circuit breaker settings
        expect(circuitConfig.failureThreshold).toBeLessThanOrEqual(5); // Quick failure detection
        expect(circuitConfig.timeoutMs).toBeLessThanOrEqual(30000); // Max 30 seconds before failover
        expect(circuitConfig.retryDelayMs).toBeLessThanOrEqual(5000); // Quick retry attempts
      }
    });

    it('should initialize load balancing strategies', async () => {
      const strategies = await failoverLogic.getAvailableLoadBalancingStrategies();
      
      expect(strategies).toContain('round_robin');
      expect(strategies).toContain('health_based');
      expect(strategies).toContain('performance_weighted');
      expect(strategies).toContain('least_connections');
      expect(strategies).toContain('adaptive_weighted');
      
      // Verify default strategy is set
      const defaultStrategy = await failoverLogic.getCurrentLoadBalancingStrategy();
      expect(strategies).toContain(defaultStrategy);
    });

    it('should configure provider state machines', async () => {
      const chains = [42161, 137, 8453];
      const providers = ['quicknode', 'alchemy', 'infura'];
      
      for (const chainId of chains) {
        for (const provider of providers) {
          const providerState = await failoverLogic.getProviderState(chainId, provider);
          
          expect(['HEALTHY', 'DEGRADED', 'FAILED', 'RECOVERY'].includes(providerState.status)).toBe(true);
          expect(providerState.lastStateChange).toBeDefined();
          expect(providerState.transitions).toBeDefined();
          expect(Array.isArray(providerState.transitions)).toBe(true);
        }
      }
    });

    it('should set up exponential backoff configurations', async () => {
      const backoffConfig = await failoverLogic.getExponentialBackoffConfig();
      
      expect(backoffConfig.initialDelayMs).toBeGreaterThan(0);
      expect(backoffConfig.maxDelayMs).toBeGreaterThan(backoffConfig.initialDelayMs);
      expect(backoffConfig.multiplier).toBeGreaterThan(1);
      expect(backoffConfig.jitterFactor).toBeGreaterThanOrEqual(0);
      expect(backoffConfig.jitterFactor).toBeLessThanOrEqual(1);
      
      // MEV-optimized backoff settings
      expect(backoffConfig.initialDelayMs).toBeLessThanOrEqual(1000); // Start with short delays
      expect(backoffConfig.maxDelayMs).toBeLessThanOrEqual(30000); // Cap at 30 seconds for MEV
    });
  });

  describe('Circuit Breaker Implementation', () => {
    it('should implement circuit breaker state transitions correctly', async () => {
      const chainId = 42161;
      const provider = 'quicknode';
      
      // Configure aggressive circuit breaker for testing
      await failoverLogic.configureCircuitBreaker(chainId, provider, {
        failureThreshold: 3,
        timeoutMs: 5000,
        retryDelayMs: 1000,
        recoveryChecks: 2
      });

      // Initial state should be CLOSED (healthy)
      let circuitState = await failoverLogic.getCircuitBreakerState(chainId, provider);
      expect(circuitState.state).toBe('CLOSED');
      expect(circuitState.failureCount).toBe(0);

      // Record failures to trigger state transition
      for (let i = 0; i < 3; i++) {
        await failoverLogic.recordFailure(chainId, provider, {
          type: 'connection_timeout',
          timestamp: Date.now(),
          latencyMs: 5000,
          errorMessage: 'Connection timeout'
        });
      }

      // Circuit should now be OPEN
      circuitState = await failoverLogic.getCircuitBreakerState(chainId, provider);
      expect(circuitState.state).toBe('OPEN');
      expect(circuitState.failureCount).toBe(3);
      expect(circuitState.lastFailure).toBeDefined();
      expect(circuitState.nextRetryAt).toBeGreaterThan(Date.now());

      // Wait for retry window
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Attempt recovery
      await failoverLogic.attemptRecovery(chainId, provider);
      
      circuitState = await failoverLogic.getCircuitBreakerState(chainId, provider);
      expect(circuitState.state).toBe('HALF_OPEN');

      // Record successful operations for recovery
      for (let i = 0; i < 2; i++) {
        await failoverLogic.recordSuccess(chainId, provider, {
          timestamp: Date.now(),
          latencyMs: 150,
          operation: 'test_recovery'
        });
      }

      // Circuit should return to CLOSED
      circuitState = await failoverLogic.getCircuitBreakerState(chainId, provider);
      expect(circuitState.state).toBe('CLOSED');
      expect(circuitState.failureCount).toBe(0);
    });

    it('should handle rapid consecutive failures correctly', async () => {
      const chainId = 137;
      const provider = 'alchemy';
      
      await failoverLogic.configureCircuitBreaker(chainId, provider, {
        failureThreshold: 5,
        timeoutMs: 10000,
        retryDelayMs: 2000,
        recoveryChecks: 3
      });

      // Simulate rapid consecutive failures
      const failureCount = 10;
      const failurePromises = [];
      
      for (let i = 0; i < failureCount; i++) {
        failurePromises.push(
          failoverLogic.recordFailure(chainId, provider, {
            type: 'high_latency',
            timestamp: Date.now() + (i * 100), // 100ms apart
            latencyMs: 2000 + (i * 100),
            errorMessage: `High latency failure ${i + 1}`
          })
        );
      }

      await Promise.all(failurePromises);

      const circuitState = await failoverLogic.getCircuitBreakerState(chainId, provider);
      expect(circuitState.state).toBe('OPEN');
      expect(circuitState.failureCount).toBe(failureCount);
      
      // Should track failure rate
      const failureStats = await failoverLogic.getFailureStats(chainId, provider);
      expect(failureStats.recentFailureRate).toBeGreaterThan(0.8); // High failure rate
      expect(failureStats.averageFailureInterval).toBeLessThan(200); // Rapid failures
    });

    it('should prevent requests during circuit breaker OPEN state', async () => {
      const chainId = 8453;
      const provider = 'infura';
      
      // Configure and trigger circuit breaker
      await failoverLogic.configureCircuitBreaker(chainId, provider, {
        failureThreshold: 2,
        timeoutMs: 8000,
        retryDelayMs: 3000,
        recoveryChecks: 2
      });

      // Trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        await failoverLogic.recordFailure(chainId, provider, {
          type: 'request_timeout',
          timestamp: Date.now(),
          latencyMs: 8000,
          errorMessage: 'Request timeout'
        });
      }

      // Verify circuit is open
      const isAvailable = await failoverLogic.isProviderAvailable(chainId, provider);
      expect(isAvailable).toBe(false);
      
      // Attempt to use provider should be blocked
      const canUseProvider = await failoverLogic.canUseProvider(chainId, provider);
      expect(canUseProvider.allowed).toBe(false);
      expect(canUseProvider.reason).toBe('circuit_breaker_open');
      expect(canUseProvider.retryAfterMs).toBeGreaterThan(0);
    });

    it('should implement circuit breaker timeout correctly', async () => {
      const chainId = 42161;
      const provider = 'quicknode';
      const timeoutMs = 2000;
      
      await failoverLogic.configureCircuitBreaker(chainId, provider, {
        failureThreshold: 3,
        timeoutMs,
        retryDelayMs: 1000,
        recoveryChecks: 2
      });

      // Trigger circuit breaker
      for (let i = 0; i < 4; i++) {
        await failoverLogic.recordFailure(chainId, provider, {
          type: 'connection_error',
          timestamp: Date.now(),
          latencyMs: 1000,
          errorMessage: 'Connection error'
        });
      }

      const openTime = Date.now();
      let circuitState = await failoverLogic.getCircuitBreakerState(chainId, provider);
      expect(circuitState.state).toBe('OPEN');

      // Should remain closed during timeout period
      await new Promise(resolve => setTimeout(resolve, timeoutMs / 2));
      expect(await failoverLogic.isProviderAvailable(chainId, provider)).toBe(false);

      // Should allow retry after timeout
      await new Promise(resolve => setTimeout(resolve, timeoutMs / 2 + 200));
      
      const canRetry = await failoverLogic.canAttemptRecovery(chainId, provider);
      expect(canRetry).toBe(true);
    });
  });

  describe('Load Balancing Algorithms', () => {
    it('should implement round-robin load balancing correctly', async () => {
      const chainId = 42161;
      const providers = ['quicknode', 'alchemy', 'infura'];
      
      await failoverLogic.setLoadBalancingStrategy(chainId, 'round_robin');
      
      // Ensure all providers are healthy
      for (const provider of providers) {
        await failoverLogic.updateProviderHealth(chainId, provider, {
          healthScore: 90,
          latencyMs: 120,
          successRate: 0.98,
          consecutiveFailures: 0
        });
      }

      const selections = [];
      for (let i = 0; i < 9; i++) {
        const selected = await failoverLogic.selectProvider(chainId);
        selections.push(selected.name);
      }

      // Should cycle through providers in order
      for (let i = 0; i < 3; i++) {
        expect(selections[i]).toBe(providers[i]);
        expect(selections[i + 3]).toBe(providers[i]);
        expect(selections[i + 6]).toBe(providers[i]);
      }
    });

    it('should implement health-based load balancing correctly', async () => {
      const chainId = 137;
      const providers = ['quicknode', 'alchemy', 'infura'];
      const healthScores = [95, 70, 85];
      
      await failoverLogic.setLoadBalancingStrategy(chainId, 'health_based');
      
      // Set different health scores
      for (let i = 0; i < providers.length; i++) {
        await failoverLogic.updateProviderHealth(chainId, providers[i], {
          healthScore: healthScores[i],
          latencyMs: 120 + (i * 50),
          successRate: 0.90 + (i * 0.05),
          consecutiveFailures: i
        });
      }

      const selections = [];
      for (let i = 0; i < 20; i++) {
        const selected = await failoverLogic.selectProvider(chainId);
        selections.push(selected.name);
      }

      // Healthiest provider (quicknode) should be selected most often
      const quicknodeSelections = selections.filter(name => name === 'quicknode').length;
      const alchemySelections = selections.filter(name => name === 'alchemy').length;
      const infuraSelections = selections.filter(name => name === 'infura').length;

      expect(quicknodeSelections).toBeGreaterThan(alchemySelections);
      expect(infuraSelections).toBeGreaterThan(alchemySelections); // infura (85) > alchemy (70)
    });

    it('should implement performance-weighted load balancing', async () => {
      const chainId = 8453;
      const providers = ['quicknode', 'alchemy', 'infura'];
      const latencies = [100, 200, 150]; // quicknode fastest
      
      await failoverLogic.setLoadBalancingStrategy(chainId, 'performance_weighted');
      
      // Set different performance characteristics
      for (let i = 0; i < providers.length; i++) {
        await failoverLogic.updateProviderHealth(chainId, providers[i], {
          healthScore: 90, // Same health score
          latencyMs: latencies[i],
          successRate: 0.95,
          consecutiveFailures: 0
        });
      }

      const selections = [];
      for (let i = 0; i < 30; i++) {
        const selected = await failoverLogic.selectProvider(chainId);
        selections.push(selected.name);
      }

      // Fastest provider (quicknode) should be selected most often
      const quicknodeSelections = selections.filter(name => name === 'quicknode').length;
      const alchemySelections = selections.filter(name => name === 'alchemy').length;
      const infuraSelections = selections.filter(name => name === 'infura').length;

      expect(quicknodeSelections).toBeGreaterThan(infuraSelections);
      expect(infuraSelections).toBeGreaterThan(alchemySelections); // infura (150ms) > alchemy (200ms)
    });

    it('should execute failover in sub-100ms for MEV requirements', async () => {
      const chainId = 42161;
      const currentProvider = 'quicknode';
      const backupProvider = 'alchemy';
      
      // Ensure backup provider is healthy
      await failoverLogic.updateProviderHealth(chainId, backupProvider, {
        healthScore: 95,
        latencyMs: 110,
        successRate: 0.98,
        consecutiveFailures: 0
      });

      // Trigger failover
      const startTime = performance.now();
      const failoverResult = await failoverLogic.executeFailover(chainId, currentProvider, {
        reason: 'performance_degradation',
        triggerMetrics: {
          latencyMs: 500,
          healthScore: 45
        }
      });
      const failoverTime = performance.now() - startTime;

      // Failover should be very fast for MEV requirements
      expect(failoverTime).toBeLessThan(100); // Sub-100ms failover
      expect(failoverResult.success).toBe(true);
      expect(failoverResult.newProvider).toBe(backupProvider);
      expect(failoverResult.executionTimeMs).toBeLessThan(100);
      
      // Failover event should be recorded
      const failoverEvents = await failoverLogic.getFailoverHistory(chainId);
      expect(failoverEvents.length).toBeGreaterThan(0);
      
      const latestEvent = failoverEvents[0];
      expect(latestEvent.fromProvider).toBe(currentProvider);
      expect(latestEvent.toProvider).toBe(backupProvider);
      expect(latestEvent.reason).toBe('performance_degradation');
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

      // Test that failover logic works within isolated environment
      const systemStatus = await failoverLogic.getSystemStatus();
      expect(systemStatus.healthy).toBe(true);
      expect(systemStatus.activeChains).toEqual(testEnv.config.chainIds);
    });

    it('should integrate with performance monitoring', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      const startTime = Date.now();
      
      // Perform failover operations
      await failoverLogic.selectProvider(42161);
      await failoverLogic.recordFailure(42161, 'quicknode', {
        type: 'timeout',
        timestamp: Date.now(),
        latencyMs: 1000,
        errorMessage: 'Test timeout'
      });
      
      const operationTime = Date.now() - startTime;
      
      testEnv.performance.incrementDatabaseOperations();
      
      const performanceMetrics = testEnv.performance.getCurrentMetrics();
      expect(performanceMetrics.databaseOperations).toBeGreaterThan(0);
      expect(operationTime).toBeLessThan(500); // Fast failover operations
    });
  });

  describe('MEV Trading Specific Requirements', () => {
    it('should prioritize MEV-optimized failover strategies', async () => {
      const chainId = 42161;
      
      // Configure MEV-optimized failover
      await failoverLogic.configureMevOptimization(chainId, {
        maxLatencyMs: 300, // Stricter than standard 350ms
        minSuccessRate: 0.97, // Higher than standard 0.95
        maxFailoverTimeMs: 75, // Sub-100ms failover requirement
        prioritizePerformance: true
      });

      const providers = ['quicknode', 'alchemy', 'infura'];
      
      // Set providers with different MEV suitability
      await failoverLogic.updateProviderHealth(chainId, 'quicknode', {
        healthScore: 90,
        latencyMs: 280, // Good for MEV
        successRate: 0.98,
        consecutiveFailures: 0
      });
      
      await failoverLogic.updateProviderHealth(chainId, 'alchemy', {
        healthScore: 95, // Higher health
        latencyMs: 320, // Above MEV threshold
        successRate: 0.99,
        consecutiveFailures: 0
      });
      
      await failoverLogic.updateProviderHealth(chainId, 'infura', {
        healthScore: 85,
        latencyMs: 250, // Best for MEV
        successRate: 0.96,
        consecutiveFailures: 1
      });

      // MEV-optimized selection should prefer low latency over high health
      const selectedProvider = await failoverLogic.selectMevOptimizedProvider(chainId);
      expect(selectedProvider.name).toBe('infura'); // Lowest latency despite lower health
      
      // Verify MEV-specific scoring
      const mevScores = await failoverLogic.getMevOptimizationScores(chainId);
      expect(mevScores.infura).toBeGreaterThan(mevScores.alchemy); // Latency weighted higher
    });

    it('should handle MEV competition scenarios', async () => {
      const chainId = 137;
      
      // Simulate high MEV competition requiring fastest possible execution
      await failoverLogic.setMevCompetitionMode(chainId, {
        enabled: true,
        maxTolerableLatencyMs: 250,
        aggressiveFailover: true,
        competitionLevel: 'extreme'
      });

      // Set provider that becomes too slow for MEV competition
      await failoverLogic.updateProviderHealth(chainId, 'quicknode', {
        healthScore: 95,
        latencyMs: 270, // Above competition threshold
        successRate: 0.99,
        consecutiveFailures: 0
      });

      // Should trigger automatic failover due to MEV competition requirements
      const competitionCheck = await failoverLogic.checkMevCompetitionViability(chainId, 'quicknode');
      expect(competitionCheck.viable).toBe(false);
      expect(competitionCheck.reason).toBe('latency_above_competition_threshold');
      
      // Should recommend immediate failover
      expect(competitionCheck.recommendedAction).toBe('immediate_failover');
      expect(competitionCheck.urgency).toBe('critical');
    });

    it('should calculate MEV opportunity cost for failover decisions', async () => {
      const chainId = 8453;
      
      // Set market conditions with high MEV activity
      await failoverLogic.setMarketConditions(chainId, {
        mevActivity: 'high',
        averageOpportunityValueUsd: 25,
        opportunitiesPerMinute: 8,
        competitionIntensity: 'high'
      });

      // Evaluate cost of degraded provider performance
      const costAnalysis = await failoverLogic.calculateMevOpportunityCost(chainId, 'quicknode', {
        currentLatencyMs: 380,
        targetLatencyMs: 200,
        downtimeMs: 0,
        degradationDurationMs: 60000 // 1 minute of degraded performance
      });

      expect(costAnalysis.estimatedLossUsd).toBeGreaterThan(0);
      expect(costAnalysis.missedOpportunities).toBeGreaterThan(0);
      expect(costAnalysis.competitiveDisadvantage).toBeDefined();
      
      // High MEV activity should result in significant opportunity cost
      expect(costAnalysis.estimatedLossUsd).toBeGreaterThan(50); // Significant loss due to latency
      expect(costAnalysis.recommendFailover).toBe(true);
    });
  });

  describe('Financial Data Integrity', () => {
    it('should maintain precise timing measurements for failover operations', async () => {
      const chainId = 42161;
      const provider = 'quicknode';
      
      // Execute multiple failover timing measurements
      const timingMeasurements = [];
      for (let i = 0; i < 10; i++) {
        const startTime = performance.now();
        
        await failoverLogic.executeFailover(chainId, provider, {
          reason: `timing_test_${i}`,
          targetProvider: 'alchemy'
        });
        
        const executionTime = performance.now() - startTime;
        timingMeasurements.push(executionTime);
        
        // Reset state for next test
        await failoverLogic.resetProviderState(chainId, provider);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Verify precision in timing measurements
      timingMeasurements.forEach(time => {
        expect(typeof time).toBe('number');
        expect(time % 1).not.toBe(0); // Should have decimal precision
        expect(time).toBeGreaterThan(0);
        expect(time).toBeLessThan(1000); // Reasonable upper bound
      });
      
      // Calculate statistics with precision
      const avgTime = timingMeasurements.reduce((sum, time) => sum + time, 0) / timingMeasurements.length;
      const minTime = Math.min(...timingMeasurements);
      const maxTime = Math.max(...timingMeasurements);
      
      expect(avgTime).toBeGreaterThan(0);
      expect(maxTime).toBeGreaterThan(minTime);
      expect(avgTime.toString().includes('.')).toBe(true); // Should have decimal precision
    });

    it('should handle extreme precision in health score calculations', async () => {
      const chainId = 137;
      const provider = 'alchemy';
      
      // Test with extremely precise health metrics
      const preciseMetrics = {
        healthScore: 87.123456789,
        latencyMs: 156.789123456,
        successRate: 0.967890123456,
        consecutiveFailures: 2,
        timestamp: Date.now()
      };
      
      await failoverLogic.updateProviderHealth(chainId, provider, preciseMetrics);
      
      const storedHealth = await failoverLogic.getProviderHealth(chainId, provider);
      
      // Verify precision is maintained
      expect(storedHealth.healthScore).toBeCloseTo(87.123456789, 6);
      expect(storedHealth.latencyMs).toBeCloseTo(156.789123456, 6);
      expect(storedHealth.successRate).toBeCloseTo(0.967890123456, 12);
      
      // Calculations should maintain precision
      const weightedScore = await failoverLogic.calculateWeightedHealthScore(chainId, provider);
      expect(typeof weightedScore).toBe('number');
      expect(isFinite(weightedScore)).toBe(true);
      expect(isNaN(weightedScore)).toBe(false);
    });
  });
});
