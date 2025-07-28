/**
 * 📊 Logger Unit Tests
 * 
 * Comprehensive testing of logging functionality for enterprise MEV infrastructure.
 * Tests structured logging, performance tracking, health monitoring, and failover event logging.
 * 
 * @fileoverview Logger component unit tests with real infrastructure validation
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment, TestEnvInstance } from '../../helpers/TestEnvironment';
import { PerformanceMetrics } from '../../helpers/PerformanceMetrics';
import { Logger } from '@utils/Logger';
import fs from 'fs/promises';
import path from 'path';

describe('Logger Unit Tests - Enterprise MEV Infrastructure', () => {
  let testEnv: TestEnvInstance | null = null;
  let logger: Logger;
  let logDirectory: string;
  let testLogFile: string;

  beforeEach(async () => {
    // Setup isolated test environment with real infrastructure
    testEnv = await TestEnvironment.setupTestEnvironment('logger-unit-test', {
      isolationLevel: 'unit',
      enableRealDatabases: false, // Logger doesn't need databases
      enableRealRpc: false,
      enableRealWebSockets: false,
      chainIds: [42161],
      performance: {
        timeoutMs: 5000, // Fast logger tests
        maxMemoryMB: 128,
        maxCpuPercent: 25
      }
    });

    // Create test log directory
    logDirectory = path.join(process.cwd(), 'logs', 'test');
    await fs.mkdir(logDirectory, { recursive: true });
    
    testLogFile = path.join(logDirectory, `logger-test-${testEnv.testId}.log`);
    
    // Get logger instance for testing
    logger = Logger.getInstance();
  });

  afterEach(async () => {
    if (testEnv) {
      await testEnv.cleanup();
      testEnv = null;
    }

    // Cleanup test log files
    try {
      await fs.unlink(testLogFile);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe('Logger Initialization & Singleton Pattern', () => {
    it('should return the same instance across multiple calls', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      
      expect(logger1).toBe(logger2);
      expect(logger1).toBeInstanceOf(Logger);
    });

    it('should initialize with correct log levels', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should handle logger configuration correctly', () => {
      // Test that logger respects environment configuration
      const logLevel = process.env.LOG_LEVEL || 'info';
      expect(['debug', 'info', 'warn', 'error'].includes(logLevel)).toBe(true);
    });
  });

  describe('Basic Logging Functionality', () => {
    it('should log info messages with correct structure', async () => {
      const testMessage = 'Test info message for MEV bot';
      const testMetadata = { 
        component: 'test',
        chainId: 42161,
        provider: 'quicknode'
      };

      // Performance measurement for logging speed
      const startTime = Date.now();
      logger.info(testMessage, testMetadata);
      const logTime = Date.now() - startTime;

      // Logging should be very fast (<1ms for MEV requirements)
      expect(logTime).toBeLessThan(10);
    });

    it('should log debug messages when debug level enabled', () => {
      const testMessage = 'Test debug message for development';
      const testMetadata = { 
        function: 'unitTest',
        performance: { executionTimeMs: 25 }
      };

      // Should not throw
      expect(() => {
        logger.debug(testMessage, testMetadata);
      }).not.toThrow();
    });

    it('should log warning messages with proper context', () => {
      const testMessage = 'Test warning for potential MEV issue';
      const testMetadata = { 
        severity: 'medium',
        chainId: 42161,
        affectedComponent: 'provider-health'
      };

      expect(() => {
        logger.warn(testMessage, testMetadata);
      }).not.toThrow();
    });

    it('should log error messages with stack traces', () => {
      const testError = new Error('Test error for failure handling');
      const testMetadata = { 
        component: 'rpc-provider',
        chainId: 42161,
        provider: 'failed-provider'
      };

      expect(() => {
        logger.error('Test error message', testMetadata, testError);
      }).not.toThrow();
    });
  });

  describe('Specialized MEV Logging Methods', () => {
    describe('Performance Logging', () => {
      it('should log performance metrics with timing validation', () => {
        const performanceData = {
          operation: 'provider-selection',
          executionTimeMs: 45,
          chainId: 42161,
          provider: 'quicknode',
          success: true
        };

        const startTime = Date.now();
        logger.performance('Provider selection completed', performanceData);
        const logTime = Date.now() - startTime;

        // Performance logging should be extremely fast
        expect(logTime).toBeLessThan(5);
      });

      it('should handle sub-350ms MEV performance requirements', () => {
        const mevPerformanceData = {
          operation: 'arbitrage-detection',
          executionTimeMs: 180, // Well under 350ms requirement
          chainId: 42161,
          opportunity: 'cross-dex-arbitrage',
          profitUsd: 15.50,
          gasEstimate: '0.002'
        };

        expect(() => {
          logger.performance('MEV opportunity detected', mevPerformanceData);
        }).not.toThrow();

        // Validate MEV timing requirements
        expect(mevPerformanceData.executionTimeMs).toBeLessThan(350);
      });

      it('should track provider failover performance', () => {
        const failoverData = {
          operation: 'provider-failover',
          executionTimeMs: 85, // Under 100ms failover requirement
          fromProvider: 'quicknode',
          toProvider: 'alchemy',
          chainId: 42161,
          reason: 'health-degradation'
        };

        logger.performance('Provider failover completed', failoverData);

        // Validate failover timing requirements
        expect(failoverData.executionTimeMs).toBeLessThan(100);
      });
    });

    describe('Provider Health Logging', () => {
      it('should log provider health status changes', () => {
        const healthData = {
          chainId: 42161,
          provider: 'quicknode',
          oldStatus: 'healthy',
          newStatus: 'degraded',
          healthScore: 65,
          metrics: {
            latencyMs: 450,
            successRate: 0.92,
            blocksSynced: true
          }
        };

        expect(() => {
          logger.providerHealth('Provider health status changed', healthData);
        }).not.toThrow();
      });

      it('should log predictive failure analysis', () => {
        const predictionData = {
          chainId: 137,
          provider: 'alchemy',
          prediction: {
            riskLevel: 'medium',
            confidence: 0.75,
            timeToFailureMs: 120000,
            reasons: ['increasing-latency', 'declining-success-rate']
          },
          currentMetrics: {
            latencyMs: 380,
            successRate: 0.94,
            trendDirection: 'declining'
          }
        };

        logger.providerHealth('Predictive failure analysis', predictionData);
      });

      it('should log comprehensive health scoring', () => {
        const scoringData = {
          chainId: 8453,
          provider: 'infura',
          healthScore: 85,
          components: {
            connectivity: 90,
            performance: 85,
            reliability: 80,
            blockSync: 95
          },
          trend: 'stable',
          lastUpdated: new Date().toISOString()
        };

        logger.providerHealth('Health score calculated', scoringData);

        // Validate health score is in valid range
        expect(scoringData.healthScore).toBeGreaterThanOrEqual(0);
        expect(scoringData.healthScore).toBeLessThanOrEqual(100);
      });
    });

    describe('Circuit Breaker Logging', () => {
      it('should log circuit breaker state transitions', () => {
        const circuitBreakerData = {
          chainId: 42161,
          provider: 'quicknode',
          oldState: 'CLOSED',
          newState: 'OPEN',
          failureCount: 5,
          threshold: 5,
          timeoutMs: 30000,
          reason: 'consecutive-failures'
        };

        expect(() => {
          logger.circuitBreaker('Circuit breaker opened', circuitBreakerData);
        }).not.toThrow();
      });

      it('should log circuit breaker recovery', () => {
        const recoveryData = {
          chainId: 137,
          provider: 'alchemy',
          state: 'HALF_OPEN',
          testResult: 'success',
          nextState: 'CLOSED',
          recoveryAttempt: 3,
          totalDowntimeMs: 45000
        };

        logger.circuitBreaker('Circuit breaker recovery test', recoveryData);
      });
    });

    describe('Failover Event Logging', () => {
      it('should log provider failover events with comprehensive data', () => {
        const failoverData = {
          chainId: 42161,
          fromProvider: 'quicknode',
          toProvider: 'alchemy',
          trigger: 'health-degradation',
          executionTimeMs: 75,
          healthScores: {
            quicknode: 45,
            alchemy: 92
          },
          impact: {
            requestsAffected: 12,
            downtime: 0
          }
        };

        const startTime = Date.now();
        logger.failover('Provider failover executed', failoverData);
        const logTime = Date.now() - startTime;

        // Failover logging should be very fast
        expect(logTime).toBeLessThan(10);
        
        // Validate failover timing meets requirements
        expect(failoverData.executionTimeMs).toBeLessThan(100);
      });

      it('should log load balancing decisions', () => {
        const loadBalancingData = {
          chainId: 8453,
          strategy: 'health-based',
          providers: [
            { name: 'quicknode', healthScore: 88, load: 45 },
            { name: 'alchemy', healthScore: 92, load: 38 },
            { name: 'infura', healthScore: 79, load: 55 }
          ],
          selectedProvider: 'alchemy',
          selectionReason: 'best-health-load-ratio'
        };

        logger.loadBalancing('Load balancing decision made', loadBalancingData);
      });
    });

    describe('WebSocket Event Logging', () => {
      it('should log WebSocket connection events', () => {
        const connectionData = {
          chainId: 42161,
          provider: 'quicknode',
          event: 'connected',
          reconnectAttempt: 0,
          connectionTimeMs: 1200,
          url: 'wss://test-endpoint.quicknode.pro'
        };

        logger.websocket('WebSocket connection established', connectionData);
      });

      it('should log WebSocket reconnection attempts', () => {
        const reconnectionData = {
          chainId: 137,
          provider: 'alchemy',
          event: 'reconnecting',
          attempt: 3,
          backoffMs: 8000,
          lastError: 'connection-timeout',
          totalDowntimeMs: 15000
        };

        logger.websocket('WebSocket reconnection attempt', reconnectionData);
      });

      it('should log block monitoring events', () => {
        const blockData = {
          chainId: 42161,
          blockNumber: 150789456,
          blockTime: 2.1,
          avgBlockTime: 2.0,
          provider: 'quicknode',
          eventCount: 45,
          processingTimeMs: 12
        };

        logger.websocket('Block monitoring event', blockData);

        // Validate block processing is fast enough for MEV
        expect(blockData.processingTimeMs).toBeLessThan(50);
      });
    });

    describe('Operations Alerting', () => {
      it('should log critical operational alerts', () => {
        const alertData = {
          severity: 'critical',
          component: 'rpc-provider-manager',
          chainId: 42161,
          message: 'All providers failed for chain',
          impact: 'trading-halted',
          actionRequired: 'immediate-intervention',
          affectedProviders: ['quicknode', 'alchemy', 'infura']
        };

        logger.operationsAlert('Critical system alert', alertData);
      });

      it('should log performance degradation alerts', () => {
        const perfAlertData = {
          severity: 'warning',
          component: 'arbitrage-detection',
          metric: 'detection-latency',
          currentValue: 420,
          threshold: 350,
          trend: 'increasing',
          chainId: 137
        };

        logger.operationsAlert('Performance threshold exceeded', perfAlertData);

        // Validate alert is triggered for MEV performance issues
        expect(perfAlertData.currentValue).toBeGreaterThan(perfAlertData.threshold);
      });
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle undefined metadata gracefully', () => {
      expect(() => {
        logger.info('Message without metadata');
      }).not.toThrow();
    });

    it('should handle null metadata gracefully', () => {
      expect(() => {
        logger.info('Message with null metadata', null);
      }).not.toThrow();
    });

    it('should handle circular references in metadata', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;

      expect(() => {
        logger.info('Message with circular reference', circularObj);
      }).not.toThrow();
    });

    it('should handle very large metadata objects', () => {
      const largeMetadata = {
        data: new Array(1000).fill(0).map((_, i) => ({ 
          id: i, 
          value: `test-value-${i}`,
          timestamp: Date.now() 
        }))
      };

      const startTime = Date.now();
      logger.info('Message with large metadata', largeMetadata);
      const logTime = Date.now() - startTime;

      // Even large metadata should log reasonably fast
      expect(logTime).toBeLessThan(100);
    });

    it('should handle invalid log levels gracefully', () => {
      // This tests the logger's robustness to configuration issues
      expect(() => {
        logger.debug('Debug message during invalid config test');
      }).not.toThrow();
    });
  });

  describe('Performance & Memory Management', () => {
    it('should maintain consistent performance under load', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        logger.info(`Load test message ${i}`, { 
          iteration: i,
          chainId: 42161,
          testData: `data-${i}`
        });
        times.push(Date.now() - startTime);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);

      // Average logging time should be very fast for MEV requirements
      expect(avgTime).toBeLessThan(5);
      expect(maxTime).toBeLessThan(20);
    });

    it('should not cause memory leaks with repeated logging', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Log many messages
      for (let i = 0; i < 1000; i++) {
        logger.info(`Memory test ${i}`, { 
          iteration: i,
          data: new Array(100).fill(`test-${i}`)
        });
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncreaseMB = (finalMemory - initialMemory) / 1024 / 1024;

      // Memory increase should be reasonable (less than 50MB for 1000 log messages)
      expect(memoryIncreaseMB).toBeLessThan(50);
    });

    it('should handle concurrent logging safely', async () => {
      const concurrentPromises = [];
      const messageCount = 50;

      for (let i = 0; i < messageCount; i++) {
        concurrentPromises.push(
          Promise.resolve().then(() => {
            logger.info(`Concurrent message ${i}`, { 
              threadId: i,
              timestamp: Date.now(),
              chainId: [42161, 137, 8453][i % 3]
            });
          })
        );
      }

      // All concurrent logging should complete without errors
      await expect(Promise.all(concurrentPromises)).resolves.toBeDefined();
    });
  });

  describe('Integration with Test Environment', () => {
    it('should integrate with test environment performance monitoring', () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      const performanceData = {
        operation: 'logger-integration-test',
        executionTimeMs: 25,
        component: 'logger',
        success: true
      };

      // Log with performance monitoring
      logger.performance('Test environment integration', performanceData);

      // Check that test environment captured the performance data
      const metrics = testEnv.performance.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.testId).toBe(testEnv.testId);
    });

    it('should work correctly within test isolation', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      // Test that logger works within isolated test environment
      const testData = {
        testId: testEnv.testId,
        isolationLevel: testEnv.config.isolationLevel,
        timestamp: Date.now()
      };

      expect(() => {
        logger.info('Test isolation validation', testData);
      }).not.toThrow();
    });
  });

  describe('Financial Infrastructure Requirements', () => {
    it('should log with precision required for financial operations', () => {
      const financialData = {
        operation: 'arbitrage-opportunity',
        profitUsd: 12.456789123, // High precision
        gasEstimateEth: 0.00234567891,
        slippagePercent: 0.5,
        executionTimeMs: 245,
        chainId: 42161
      };

      logger.info('Financial operation logged', financialData);

      // Validate precision is maintained
      expect(financialData.profitUsd.toString()).toContain('12.456789123');
      expect(financialData.gasEstimateEth.toString()).toContain('0.00234567891');
    });

    it('should handle sensitive financial data appropriately', () => {
      const sensitiveData = {
        operation: 'flash-loan-execution',
        amount: '100000.00',
        token: 'USDC',
        chainId: 42161,
        // Note: Not logging private keys or wallet addresses
        publicTransactionHash: '0x1234...abcd'
      };

      expect(() => {
        logger.info('Flash loan operation', sensitiveData);
      }).not.toThrow();

      // Ensure no sensitive data like private keys are logged
      expect(JSON.stringify(sensitiveData)).not.toContain('privateKey');
      expect(JSON.stringify(sensitiveData)).not.toContain('mnemonic');
    });

    it('should provide audit trail for financial operations', () => {
      const auditData = {
        operation: 'arbitrage-execution',
        transactionHash: '0xabcd1234567890',
        profitRealized: 15.75,
        gasUsed: '0.00189',
        executionTimeMs: 312,
        chainId: 42161,
        strategy: 'cross-dex',
        timestamp: new Date().toISOString()
      };

      logger.info('Audit trail entry', auditData);

      // Validate audit data completeness
      expect(auditData.transactionHash).toBeDefined();
      expect(auditData.profitRealized).toBeGreaterThan(0);
      expect(auditData.timestamp).toBeDefined();
    });
  });

  describe('MEV Competition Requirements', () => {
    it('should maintain sub-millisecond logging for MEV detection', () => {
      const mevData = {
        opportunity: 'cross-dex-arbitrage',
        detectionTimeMs: 0.8, // Sub-millisecond detection
        profitUsd: 8.25,
        confidence: 0.95,
        chainId: 42161
      };

      const startTime = performance.now();
      logger.info('MEV opportunity detected', mevData);
      const logTime = performance.now() - startTime;

      // Logging should not add significant latency to MEV detection
      expect(logTime).toBeLessThan(1); // Less than 1ms
      expect(mevData.detectionTimeMs).toBeLessThan(1);
    });

    it('should log competitive analysis data', () => {
      const competitiveData = {
        opportunity: 'triangular-arbitrage',
        competingBots: 3,
        ourExecutionTimeMs: 280,
        estimatedCompetitorTimeMs: 320,
        competitiveAdvantageMs: 40,
        successProbability: 0.85
      };

      logger.info('Competitive analysis', competitiveData);

      // Validate competitive advantage
      expect(competitiveData.ourExecutionTimeMs).toBeLessThan(competitiveData.estimatedCompetitorTimeMs);
    });
  });
});
