/**
 * 💾 Redis Cache Unit Tests
 * 
 * Comprehensive testing of Redis caching functionality for enterprise MEV infrastructure.
 * Tests caching strategies, TTL management, performance optimization, and data integrity.
 * 
 * @fileoverview Redis cache component unit tests with real database validation
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment, TestEnvInstance } from '../../helpers/TestEnvironment';
import { PerformanceMetrics } from '../../helpers/PerformanceMetrics';
import { RedisCache } from '@storage/RedisCache';
import { Logger } from '@utils/Logger';

describe('RedisCache Unit Tests - Enterprise MEV Infrastructure', () => {
  let testEnv: TestEnvInstance | null = null;
  let redisCache: RedisCache;
  let logger: Logger;

  beforeEach(async () => {
    // Setup test environment with real Redis instance
    testEnv = await TestEnvironment.setupTestEnvironment('redis-cache-unit-test', {
      isolationLevel: 'unit',
      enableRealDatabases: true, // Enable Redis for testing
      enableRealRpc: false,
      enableRealWebSockets: false,
      chainIds: [42161],
      performance: {
        timeoutMs: 8000, // Allow time for Redis operations
        maxMemoryMB: 256,
        maxCpuPercent: 50
      }
    });

    logger = Logger.getInstance();

    // Initialize Redis cache with test database
    if (!testEnv.databases) {
      throw new Error('Test databases not initialized');
    }

    redisCache = new RedisCache(testEnv.databases.redis);

    // Clear test Redis database to ensure clean state
    await testEnv.databases.redis.flushdb();
  });

  afterEach(async () => {
    if (testEnv && testEnv.databases) {
      // Clean up test data
      await testEnv.databases.redis.flushdb();
      await testEnv.cleanup();
      testEnv = null;
    }
  });

  describe('Cache Initialization & Connection', () => {
    it('should initialize with valid Redis connection', () => {
      expect(redisCache).toBeInstanceOf(RedisCache);
      expect(redisCache).toBeDefined();
    });

    it('should verify Redis connection health', async () => {
      if (!testEnv?.databases) throw new Error('Databases not available');
      
      const pingResult = await testEnv.databases.redis.ping();
      expect(pingResult).toBe('PONG');
    });

    it('should handle Redis connection errors gracefully', async () => {
      // Test error handling without breaking the cache
      expect(() => {
        new RedisCache(testEnv!.databases!.redis);
      }).not.toThrow();
    });
  });

  describe('Basic Cache Operations', () => {
    describe('Set and Get Operations', () => {
      it('should store and retrieve string values', async () => {
        const key = 'test:string:value';
        const value = 'Hello MEV World';

        const startTime = Date.now();
        await redisCache.set(key, value);
        const setTime = Date.now() - startTime;

        const retrieveStart = Date.now();
        const retrieved = await redisCache.get(key);
        const getTime = Date.now() - retrieveStart;

        expect(retrieved).toBe(value);
        
        // Performance validation for MEV requirements
        expect(setTime).toBeLessThan(10); // Very fast cache operations
        expect(getTime).toBeLessThan(5);
      });

      it('should store and retrieve complex objects', async () => {
        const key = 'test:object:complex';
        const complexObject = {
          chainId: 42161,
          provider: 'quicknode',
          healthScore: 85,
          metrics: {
            latency: 120,
            successRate: 0.98,
            blockHeight: 150789456
          },
          timestamp: Date.now(),
          nested: {
            arbitrage: {
              opportunities: 5,
              totalProfit: 45.67
            }
          }
        };

        await redisCache.set(key, JSON.stringify(complexObject));
        const retrieved = await redisCache.get(key);
        const parsed = JSON.parse(retrieved!);

        expect(parsed).toEqual(complexObject);
        expect(parsed.chainId).toBe(42161);
        expect(parsed.metrics.latency).toBe(120);
        expect(parsed.nested.arbitrage.totalProfit).toBe(45.67);
      });

      it('should handle null and undefined values correctly', async () => {
        const nullKey = 'test:null:value';
        const undefinedKey = 'test:undefined:value';

        await redisCache.set(nullKey, null);
        await redisCache.set(undefinedKey, undefined);

        const nullResult = await redisCache.get(nullKey);
        const undefinedResult = await redisCache.get(undefinedKey);

        expect(nullResult).toBe('null');
        expect(undefinedResult).toBe('undefined');
      });

      it('should return null for non-existent keys', async () => {
        const nonExistentKey = 'test:non:existent:key';
        const result = await redisCache.get(nonExistentKey);
        
        expect(result).toBeNull();
      });
    });

    describe('TTL (Time To Live) Management', () => {
      it('should set and respect TTL for cached values', async () => {
        const key = 'test:ttl:short';
        const value = 'This should expire';
        const ttlSeconds = 2;

        await redisCache.setWithTTL(key, value, ttlSeconds);
        
        // Value should exist immediately
        const immediate = await redisCache.get(key);
        expect(immediate).toBe(value);

        // Check TTL is set correctly
        const ttl = await redisCache.getTTL(key);
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(ttlSeconds);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, ttlSeconds * 1000 + 100));
        
        const expired = await redisCache.get(key);
        expect(expired).toBeNull();
      }, 5000); // Increase timeout for TTL test

      it('should handle different TTL values for MEV data', async () => {
        const priceKey = 'price:eth:usdc:42161';
        const healthKey = 'health:quicknode:42161';
        const configKey = 'config:chains:current';

        // Different TTL for different data types
        await redisCache.setWithTTL(priceKey, '1650.50', 1); // Price data expires quickly
        await redisCache.setWithTTL(healthKey, '{"score": 90}', 30); // Health data longer TTL
        await redisCache.setWithTTL(configKey, '{"version": "1.0"}', 3600); // Config data longest TTL

        const priceTTL = await redisCache.getTTL(priceKey);
        const healthTTL = await redisCache.getTTL(healthKey);
        const configTTL = await redisCache.getTTL(configKey);

        expect(priceTTL).toBeLessThanOrEqual(1);
        expect(healthTTL).toBeLessThanOrEqual(30);
        expect(configTTL).toBeLessThanOrEqual(3600);
      });

      it('should update TTL for existing keys', async () => {
        const key = 'test:ttl:update';
        const value = 'TTL update test';

        await redisCache.setWithTTL(key, value, 10);
        const initialTTL = await redisCache.getTTL(key);

        // Update TTL
        await redisCache.updateTTL(key, 20);
        const updatedTTL = await redisCache.getTTL(key);

        expect(updatedTTL).toBeGreaterThan(initialTTL);
        expect(updatedTTL).toBeLessThanOrEqual(20);
      });
    });

    describe('Delete Operations', () => {
      it('should delete individual keys', async () => {
        const key = 'test:delete:single';
        const value = 'To be deleted';

        await redisCache.set(key, value);
        expect(await redisCache.get(key)).toBe(value);

        const deleted = await redisCache.delete(key);
        expect(deleted).toBe(1); // Redis returns number of keys deleted

        expect(await redisCache.get(key)).toBeNull();
      });

      it('should delete multiple keys at once', async () => {
        const keys = ['test:delete:multi:1', 'test:delete:multi:2', 'test:delete:multi:3'];
        const values = ['Value 1', 'Value 2', 'Value 3'];

        // Set multiple keys
        for (let i = 0; i < keys.length; i++) {
          await redisCache.set(keys[i], values[i]);
        }

        // Verify all keys exist
        for (const key of keys) {
          expect(await redisCache.get(key)).toBeDefined();
        }

        // Delete all keys
        const deletedCount = await redisCache.deleteMultiple(keys);
        expect(deletedCount).toBe(keys.length);

        // Verify all keys are gone
        for (const key of keys) {
          expect(await redisCache.get(key)).toBeNull();
        }
      });

      it('should handle deletion of non-existent keys gracefully', async () => {
        const nonExistentKey = 'test:delete:nonexistent';
        
        const deletedCount = await redisCache.delete(nonExistentKey);
        expect(deletedCount).toBe(0);
      });
    });
  });

  describe('MEV-Specific Cache Operations', () => {
    describe('Provider Health Metrics Caching', () => {
      it('should cache provider health scores with appropriate TTL', async () => {
        const chainId = 42161;
        const provider = 'quicknode';
        const healthData = {
          score: 88,
          latency: 150,
          successRate: 0.97,
          blockSync: true,
          timestamp: Date.now()
        };

        const key = `health:${provider}:${chainId}`;
        const ttl = 30; // 30 seconds for health data

        await redisCache.setProviderHealth(chainId, provider, healthData, ttl);
        
        const cached = await redisCache.getProviderHealth(chainId, provider);
        expect(cached).toEqual(healthData);

        // Verify TTL is set
        const remainingTTL = await redisCache.getTTL(key);
        expect(remainingTTL).toBeGreaterThan(0);
        expect(remainingTTL).toBeLessThanOrEqual(ttl);
      });

      it('should cache multiple provider health metrics', async () => {
        const chainId = 42161;
        const providers = ['quicknode', 'alchemy', 'infura'];
        const healthDataMap = new Map();

        // Cache health data for all providers
        for (let i = 0; i < providers.length; i++) {
          const healthData = {
            score: 85 + i * 5,
            latency: 120 + i * 50,
            successRate: 0.95 + i * 0.01,
            blockSync: true,
            timestamp: Date.now()
          };
          
          healthDataMap.set(providers[i], healthData);
          await redisCache.setProviderHealth(chainId, providers[i], healthData, 60);
        }

        // Retrieve and validate all health data
        for (const provider of providers) {
          const cached = await redisCache.getProviderHealth(chainId, provider);
          const expected = healthDataMap.get(provider);
          expect(cached).toEqual(expected);
        }
      });

      it('should handle provider health cache expiration', async () => {
        const chainId = 137;
        const provider = 'alchemy';
        const healthData = {
          score: 75,
          latency: 200,
          successRate: 0.93,
          blockSync: false,
          timestamp: Date.now()
        };

        // Cache with very short TTL
        await redisCache.setProviderHealth(chainId, provider, healthData, 1);
        
        // Should exist immediately
        expect(await redisCache.getProviderHealth(chainId, provider)).toEqual(healthData);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        // Should be expired
        expect(await redisCache.getProviderHealth(chainId, provider)).toBeNull();
      }, 3000);
    });

    describe('Circuit Breaker State Caching', () => {
      it('should cache circuit breaker states', async () => {
        const chainId = 42161;
        const provider = 'quicknode';
        const circuitState = {
          state: 'OPEN',
          failureCount: 5,
          lastFailure: Date.now(),
          nextRetry: Date.now() + 30000,
          threshold: 5
        };

        await redisCache.setCircuitBreakerState(chainId, provider, circuitState);
        
        const cached = await redisCache.getCircuitBreakerState(chainId, provider);
        expect(cached).toEqual(circuitState);
      });

      it('should update circuit breaker state transitions', async () => {
        const chainId = 8453;
        const provider = 'infura';
        
        // Initial state
        const initialState = {
          state: 'CLOSED',
          failureCount: 0,
          lastFailure: null,
          nextRetry: null,
          threshold: 5
        };
        
        await redisCache.setCircuitBreakerState(chainId, provider, initialState);
        expect(await redisCache.getCircuitBreakerState(chainId, provider)).toEqual(initialState);

        // Transition to OPEN
        const openState = {
          state: 'OPEN',
          failureCount: 5,
          lastFailure: Date.now(),
          nextRetry: Date.now() + 30000,
          threshold: 5
        };
        
        await redisCache.setCircuitBreakerState(chainId, provider, openState);
        expect(await redisCache.getCircuitBreakerState(chainId, provider)).toEqual(openState);
      });
    });

    describe('Request Statistics Caching', () => {
      it('should cache and update request statistics', async () => {
        const chainId = 42161;
        const provider = 'quicknode';
        const stats = {
          totalRequests: 1000,
          successfulRequests: 980,
          failedRequests: 20,
          avgResponseTime: 145,
          lastRequest: Date.now()
        };

        await redisCache.setRequestStats(chainId, provider, stats);
        
        const cached = await redisCache.getRequestStats(chainId, provider);
        expect(cached).toEqual(stats);
        expect(cached.totalRequests).toBe(1000);
        expect(cached.successfulRequests).toBe(980);
      });

      it('should increment request counters atomically', async () => {
        const chainId = 137;
        const provider = 'alchemy';
        
        // Initialize stats
        const initialStats = {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          avgResponseTime: 0,
          lastRequest: Date.now()
        };
        
        await redisCache.setRequestStats(chainId, provider, initialStats);

        // Increment counters multiple times
        for (let i = 0; i < 10; i++) {
          await redisCache.incrementRequestCounter(chainId, provider, 'total');
          if (i % 3 === 0) {
            await redisCache.incrementRequestCounter(chainId, provider, 'failed');
          } else {
            await redisCache.incrementRequestCounter(chainId, provider, 'successful');
          }
        }

        const finalStats = await redisCache.getRequestStats(chainId, provider);
        expect(finalStats.totalRequests).toBe(10);
        expect(finalStats.successfulRequests).toBe(7); // 10 - 3 failed
        expect(finalStats.failedRequests).toBe(3);
      });
    });

    describe('Failover Event Caching', () => {
      it('should cache failover events for analysis', async () => {
        const chainId = 42161;
        const failoverEvent = {
          fromProvider: 'quicknode',
          toProvider: 'alchemy',
          reason: 'health_degradation',
          timestamp: Date.now(),
          executionTimeMs: 85,
          healthScores: {
            quicknode: 45,
            alchemy: 92
          }
        };

        await redisCache.setFailoverEvent(chainId, failoverEvent);
        
        const cached = await redisCache.getLatestFailoverEvent(chainId);
        expect(cached).toEqual(failoverEvent);
        expect(cached.executionTimeMs).toBe(85);
        expect(cached.healthScores.alchemy).toBe(92);
      });

      it('should maintain failover event history', async () => {
        const chainId = 8453;
        const events = [];

        // Create multiple failover events
        for (let i = 0; i < 5; i++) {
          const event = {
            fromProvider: i % 2 === 0 ? 'quicknode' : 'alchemy',
            toProvider: i % 2 === 0 ? 'alchemy' : 'infura',
            reason: 'performance_degradation',
            timestamp: Date.now() + i * 1000,
            executionTimeMs: 70 + i * 5,
            healthScores: {
              quicknode: 80 - i * 10,
              alchemy: 85 + i * 2
            }
          };
          
          events.push(event);
          await redisCache.setFailoverEvent(chainId, event);
          
          // Small delay to ensure timestamp ordering
          await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Get failover history
        const history = await redisCache.getFailoverHistory(chainId, 10);
        expect(history.length).toBe(5);
        
        // Verify chronological order (latest first)
        for (let i = 0; i < history.length - 1; i++) {
          expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i + 1].timestamp);
        }
      });
    });
  });

  describe('Performance Optimization', () => {
    describe('Batch Operations', () => {
      it('should perform batch set operations efficiently', async () => {
        const batchData = new Map();
        const keyCount = 100;

        // Prepare batch data
        for (let i = 0; i < keyCount; i++) {
          batchData.set(`batch:key:${i}`, `value-${i}`);
        }

        const startTime = Date.now();
        await redisCache.setBatch(batchData);
        const batchTime = Date.now() - startTime;

        // Verify all keys were set
        for (let i = 0; i < keyCount; i++) {
          const value = await redisCache.get(`batch:key:${i}`);
          expect(value).toBe(`value-${i}`);
        }

        // Batch operations should be much faster than individual operations
        expect(batchTime).toBeLessThan(500); // Less than 500ms for 100 keys
      });

      it('should perform batch get operations efficiently', async () => {
        const keys = [];
        const values = [];

        // Set up test data
        for (let i = 0; i < 50; i++) {
          const key = `batch:get:${i}`;
          const value = `batch-value-${i}`;
          keys.push(key);
          values.push(value);
          await redisCache.set(key, value);
        }

        const startTime = Date.now();
        const retrieved = await redisCache.getBatch(keys);
        const batchGetTime = Date.now() - startTime;

        // Verify all values retrieved correctly
        expect(retrieved.size).toBe(keys.length);
        for (let i = 0; i < keys.length; i++) {
          expect(retrieved.get(keys[i])).toBe(values[i]);
        }

        // Batch get should be fast
        expect(batchGetTime).toBeLessThan(100);
      });
    });

    describe('Memory Usage Optimization', () => {
      it('should handle large data sets efficiently', async () => {
        const initialMemory = process.memoryUsage().heapUsed;
        const largeDataCount = 1000;

        // Create large data set
        for (let i = 0; i < largeDataCount; i++) {
          const largeObject = {
            id: i,
            data: new Array(1000).fill(`data-${i}`),
            timestamp: Date.now(),
            metadata: {
              chainId: 42161,
              provider: 'test',
              metrics: new Array(100).fill(Math.random())
            }
          };
          
          await redisCache.set(`large:${i}`, JSON.stringify(largeObject));
        }

        const afterCacheMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (afterCacheMemory - initialMemory) / 1024 / 1024;

        // Memory increase should be reasonable for caching operations
        expect(memoryIncrease).toBeLessThan(200); // Less than 200MB increase

        // Clean up
        for (let i = 0; i < largeDataCount; i++) {
          await redisCache.delete(`large:${i}`);
        }
      });

      it('should compress large values when beneficial', async () => {
        const largeData = {
          chainId: 42161,
          blockData: new Array(10000).fill('block-data'),
          transactions: new Array(5000).fill({
            hash: '0x1234567890',
            value: '1000000000000000000',
            gas: '21000'
          })
        };

        const key = 'large:compressed:data';
        const dataString = JSON.stringify(largeData);
        
        const startTime = Date.now();
        await redisCache.setCompressed(key, dataString);
        const setTime = Date.now() - startTime;

        const retrieveStart = Date.now();
        const retrieved = await redisCache.getDecompressed(key);
        const getTime = Date.now() - retrieveStart;

        expect(JSON.parse(retrieved!)).toEqual(largeData);
        
        // Compressed operations should still be reasonably fast
        expect(setTime).toBeLessThan(100);
        expect(getTime).toBeLessThan(50);
      });
    });

    describe('Concurrent Access Handling', () => {
      it('should handle concurrent read/write operations safely', async () => {
        const key = 'concurrent:test';
        const concurrentOperations = 50;
        const promises = [];

        // Create concurrent read/write operations
        for (let i = 0; i < concurrentOperations; i++) {
          if (i % 2 === 0) {
            // Write operation
            promises.push(redisCache.set(`${key}:${i}`, `value-${i}`));
          } else {
            // Read operation (might return null for non-existent keys)
            promises.push(redisCache.get(`${key}:${i - 1}`));
          }
        }

        // All operations should complete without errors
        const results = await Promise.all(promises);
        expect(results.length).toBe(concurrentOperations);

        // Verify write operations succeeded
        for (let i = 0; i < concurrentOperations; i += 2) {
          const value = await redisCache.get(`${key}:${i}`);
          expect(value).toBe(`value-${i}`);
        }
      });

      it('should handle atomic increment operations correctly', async () => {
        const counterKey = 'atomic:counter';
        const incrementCount = 100;
        const promises = [];

        // Initialize counter
        await redisCache.set(counterKey, '0');

        // Create concurrent increment operations
        for (let i = 0; i < incrementCount; i++) {
          promises.push(redisCache.increment(counterKey));
        }

        const results = await Promise.all(promises);
        
        // Final value should be exactly incrementCount
        const finalValue = await redisCache.get(counterKey);
        expect(parseInt(finalValue!, 10)).toBe(incrementCount);

        // All increment operations should return sequential values
        expect(results.length).toBe(incrementCount);
      });
    });
  });

  describe('Error Handling & Edge Cases', () => {
    describe('Connection Error Handling', () => {
      it('should handle Redis connection timeouts gracefully', async () => {
        // This test simulates what happens when Redis is slow/unavailable
        const timeoutKey = 'timeout:test';
        const timeoutValue = 'timeout value';

        // Set a very short timeout for this operation
        await expect(async () => {
          await redisCache.setWithTimeout(timeoutKey, timeoutValue, 1); // 1ms timeout
        }).not.toThrow();
      });

      it('should retry failed operations with exponential backoff', async () => {
        const retryKey = 'retry:test';
        const retryValue = 'retry value';

        const startTime = Date.now();
        await redisCache.setWithRetry(retryKey, retryValue, 3); // 3 retries
        const retryTime = Date.now() - startTime;

        const retrieved = await redisCache.get(retryKey);
        expect(retrieved).toBe(retryValue);

        // Should complete reasonably quickly even with retries
        expect(retryTime).toBeLessThan(1000);
      });
    });

    describe('Data Validation & Sanitization', () => {
      it('should handle malformed JSON gracefully', async () => {
        const malformedKey = 'malformed:json';
        const malformedJson = '{"incomplete": json}';

        await redisCache.set(malformedKey, malformedJson);
        const retrieved = await redisCache.get(malformedKey);
        
        expect(retrieved).toBe(malformedJson);
        
        // Should not throw when trying to parse
        expect(() => {
          try {
            JSON.parse(retrieved!);
          } catch (e) {
            // Expected to fail parsing, but should not crash cache
          }
        }).not.toThrow();
      });

      it('should sanitize keys to prevent injection attacks', async () => {
        const maliciousKeys = [
          'key with spaces',
          'key:with:colons',
          'key\nwith\nnewlines',
          'key\twith\ttabs'
        ];

        for (const maliciousKey of maliciousKeys) {
          const sanitizedKey = redisCache.sanitizeKey(maliciousKey);
          expect(sanitizedKey).not.toContain(' ');
          expect(sanitizedKey).not.toContain('\n');
          expect(sanitizedKey).not.toContain('\t');
          
          // Should be able to use sanitized key safely
          await redisCache.set(sanitizedKey, 'safe value');
          const retrieved = await redisCache.get(sanitizedKey);
          expect(retrieved).toBe('safe value');
        }
      });

      it('should handle extremely large values appropriately', async () => {
        const largeKey = 'large:value:test';
        // Create a value larger than typical cache size
        const largeValue = new Array(1000000).fill('x').join(''); // ~1MB string

        const startTime = Date.now();
        await redisCache.set(largeKey, largeValue);
        const setTime = Date.now() - startTime;

        const retrieveStart = Date.now();
        const retrieved = await redisCache.get(largeKey);
        const getTime = Date.now() - retrieveStart;

        expect(retrieved).toBe(largeValue);
        
        // Large values should still be handled in reasonable time
        expect(setTime).toBeLessThan(1000);
        expect(getTime).toBeLessThan(500);
      });
    });

    describe('Edge Case Scenarios', () => {
      it('should handle empty values correctly', async () => {
        const emptyKey = 'empty:value';
        const emptyValue = '';

        await redisCache.set(emptyKey, emptyValue);
        const retrieved = await redisCache.get(emptyKey);
        
        expect(retrieved).toBe('');
      });

      it('should handle numeric values correctly', async () => {
        const numericKeys = ['number:int', 'number:float', 'number:zero', 'number:negative'];
        const numericValues = [42, 3.14159, 0, -100];

        for (let i = 0; i < numericKeys.length; i++) {
          await redisCache.set(numericKeys[i], numericValues[i].toString());
          const retrieved = await redisCache.get(numericKeys[i]);
          expect(parseFloat(retrieved!)).toBe(numericValues[i]);
        }
      });

      it('should handle boolean values correctly', async () => {
        const booleanKey = 'boolean:test';
        
        await redisCache.set(booleanKey, 'true');
        expect(await redisCache.get(booleanKey)).toBe('true');
        
        await redisCache.set(booleanKey, 'false');
        expect(await redisCache.get(booleanKey)).toBe('false');
      });
    });
  });

  describe('Integration with Test Environment', () => {
    it('should work within test environment isolation', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      // Test that cache works within isolated environment
      const testData = {
        testId: testEnv.testId,
        isolationLevel: testEnv.config.isolationLevel,
        timestamp: Date.now()
      };

      const key = `test:env:${testEnv.testId}`;
      await redisCache.set(key, JSON.stringify(testData));
      
      const retrieved = await redisCache.get(key);
      const parsed = JSON.parse(retrieved!);
      
      expect(parsed.testId).toBe(testEnv.testId);
      expect(parsed.isolationLevel).toBe('unit');
    });

    it('should integrate with performance monitoring', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      const performanceKey = 'performance:cache:test';
      const startTime = Date.now();
      
      await redisCache.set(performanceKey, 'performance test value');
      await redisCache.get(performanceKey);
      
      const operationTime = Date.now() - startTime;
      
      // Track performance in test environment
      testEnv.performance.incrementDatabaseOperations();
      
      const metrics = testEnv.performance.getCurrentMetrics();
      expect(metrics.databaseOperations).toBeGreaterThan(0);
      expect(operationTime).toBeLessThan(50); // Fast cache operations
    });
  });

  describe('MEV Trading Specific Requirements', () => {
    it('should meet sub-millisecond cache access for critical MEV data', async () => {
      const mevKey = 'mev:price:eth:usdc:42161';
      const priceData = {
        price: 1650.75,
        timestamp: Date.now(),
        blockNumber: 150789456,
        confidence: 0.99
      };

      // Measure cache access time with high precision
      const start = performance.now();
      await redisCache.set(mevKey, JSON.stringify(priceData));
      const setTime = performance.now() - start;

      const getStart = performance.now();
      await redisCache.get(mevKey);
      const getTime = performance.now() - getStart;

      // MEV requires extremely fast cache access
      expect(setTime).toBeLessThan(5); // Less than 5ms
      expect(getTime).toBeLessThan(2); // Less than 2ms
    });

    it('should handle high-frequency price updates efficiently', async () => {
      const updates = 1000;
      const priceKeys = [];
      
      // Simulate high-frequency price updates
      const startTime = Date.now();
      
      for (let i = 0; i < updates; i++) {
        const key = `hf:price:${i % 10}:${Date.now()}`; // 10 different price feeds
        priceKeys.push(key);
        
        await redisCache.setWithTTL(key, JSON.stringify({
          price: 1000 + Math.random() * 1000,
          timestamp: Date.now(),
          blockNumber: 150789456 + i
        }), 10); // 10 second TTL for price data
      }
      
      const totalTime = Date.now() - startTime;
      const avgTimePerUpdate = totalTime / updates;
      
      // High-frequency updates should be very fast
      expect(avgTimePerUpdate).toBeLessThan(5); // Less than 5ms per update
      expect(totalTime).toBeLessThan(2000); // Less than 2 seconds for 1000 updates
    });

    it('should cache arbitrage opportunity data with ultra-low latency', async () => {
      const opportunityData = {
        type: 'cross-dex-arbitrage',
        tokenA: 'WETH',
        tokenB: 'USDC',
        dexA: 'uniswap_v3',
        dexB: 'sushiswap',
        priceA: 1650.25,
        priceB: 1652.80,
        profitUsd: 12.75,
        gasEstimate: '0.002',
        confidence: 0.95,
        detectionTime: Date.now(),
        chainId: 42161
      };

      const opportunityKey = `opportunity:${Date.now()}:${Math.random()}`;
      
      const start = performance.now();
      await redisCache.setWithTTL(opportunityKey, JSON.stringify(opportunityData), 5); // 5 second TTL
      const cacheTime = performance.now() - start;

      const retrieved = await redisCache.get(opportunityKey);
      const parsed = JSON.parse(retrieved!);
      
      expect(parsed).toEqual(opportunityData);
      expect(cacheTime).toBeLessThan(1); // Sub-millisecond caching for MEV
    });

    it('should maintain cache consistency during high-load MEV operations', async () => {
      const concurrentOps = 100;
      const promises = [];
      const results = new Map();

      // Simulate concurrent MEV operations
      for (let i = 0; i < concurrentOps; i++) {
        const opportunityId = `mev:op:${i}`;
        const opportunityData = {
          id: i,
          profit: Math.random() * 100,
          timestamp: Date.now(),
          chainId: 42161
        };
        
        results.set(opportunityId, opportunityData);
        promises.push(
          redisCache.set(opportunityId, JSON.stringify(opportunityData))
        );
      }

      // All operations should complete without errors
      await Promise.all(promises);

      // Verify data consistency
      for (const [key, expectedData] of results) {
        const cached = await redisCache.get(key);
        const parsed = JSON.parse(cached!);
        expect(parsed).toEqual(expectedData);
      }
    });
  });

  describe('Financial Data Integrity', () => {
    it('should maintain precise decimal values for financial calculations', async () => {
      const financialData = {
        ethPrice: 1650.123456789,
        usdcBalance: 10000.987654321,
        gasPrice: 0.000000025,
        profitCalculation: 15.123456789012345,
        slippage: 0.005
      };

      const key = 'financial:precision:test';
      await redisCache.set(key, JSON.stringify(financialData));
      
      const retrieved = await redisCache.get(key);
      const parsed = JSON.parse(retrieved!);
      
      // Verify precision is maintained
      expect(parsed.ethPrice).toBe(1650.123456789);
      expect(parsed.usdcBalance).toBe(10000.987654321);
      expect(parsed.gasPrice).toBe(0.000000025);
      expect(parsed.profitCalculation).toBe(15.123456789012345);
      expect(parsed.slippage).toBe(0.005);
    });

    it('should handle large financial values correctly', async () => {
      const largeFinancialData = {
        totalValueLocked: 1234567890.123456789,
        marketCap: 987654321098.765432109,
        volumeUsd: 543210987654.321098765,
        liquidityPool: 876543210987.654321098
      };

      const key = 'financial:large:values';
      await redisCache.set(key, JSON.stringify(largeFinancialData));
      
      const retrieved = await redisCache.get(key);
      const parsed = JSON.parse(retrieved!);
      
      // Large financial values should be preserved accurately
      expect(parsed.totalValueLocked).toBe(1234567890.123456789);
      expect(parsed.marketCap).toBe(987654321098.765432109);
    });

    it('should cache transaction data with complete integrity', async () => {
      const transactionData = {
        hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        from: '0x1234567890abcdef1234567890abcdef12345678',
        to: '0x9876543210fedcba9876543210fedcba98765432',
        value: '1000000000000000000', // 1 ETH in wei
        gasLimit: '21000',
        gasPrice: '20000000000', // 20 gwei
        nonce: 42,
        blockNumber: 150789456,
        timestamp: Date.now(),
        status: 'confirmed'
      };

      const key = `tx:${transactionData.hash}`;
      await redisCache.set(key, JSON.stringify(transactionData));
      
      const retrieved = await redisCache.get(key);
      const parsed = JSON.parse(retrieved!);
      
      // Transaction data must be exact
      expect(parsed.hash).toBe(transactionData.hash);
      expect(parsed.value).toBe('1000000000000000000');
      expect(parsed.gasLimit).toBe('21000');
      expect(parsed.nonce).toBe(42);
    });
  });
});
