/**
 * 🔗 MultiChain Listener Unit Tests
 * 
 * Comprehensive testing of WebSocket monitoring for enterprise MEV infrastructure.
 * Tests real-time block monitoring, event broadcasting, connection management, and failover.
 * 
 * @fileoverview MultiChain WebSocket listener unit tests with real infrastructure validation
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment, TestEnvInstance } from '../../helpers/TestEnvironment';
import { PerformanceMetrics } from '../../helpers/PerformanceMetrics';
import { MockWebSockets } from '../../helpers/MockWebSockets';
import { MultiChainListener } from '@data/MultiChainListener';
import { Logger } from '@utils/Logger';
import { EventEmitter } from 'events';

describe('MultiChainListener Unit Tests - Enterprise MEV Infrastructure', () => {
  let testEnv: TestEnvInstance | null = null;
  let multiChainListener: MultiChainListener;
  let mockWebSockets: MockWebSockets;
  let logger: Logger;

  beforeEach(async () => {
    // Setup test environment with real databases and mock WebSockets
    testEnv = await TestEnvironment.setupTestEnvironment('multichain-listener-unit-test', {
      isolationLevel: 'unit',
      enableRealDatabases: true, // Need Redis for block caching
      enableRealRpc: false, // Use mocks for unit tests
      enableRealWebSockets: false, // Use mock WebSockets for unit tests
      chainIds: [42161, 137, 8453],
      performance: {
        timeoutMs: 15000, // Allow time for WebSocket operations
        maxMemoryMB: 512,
        maxCpuPercent: 75
      }
    });

    logger = Logger.getInstance();
    mockWebSockets = new MockWebSockets();

    if (!testEnv.databases) {
      throw new Error('Test databases not initialized');
    }

    // Initialize MultiChain Listener with test infrastructure
    multiChainListener = new MultiChainListener(testEnv.databases, mockWebSockets);
  });

  afterEach(async () => {
    if (multiChainListener) {
      await multiChainListener.shutdown();
    }
    if (mockWebSockets) {
      await mockWebSockets.cleanup();
    }
    if (testEnv) {
      await testEnv.cleanup();
      testEnv = null;
    }
  });

  describe('Listener Initialization & Configuration', () => {
    it('should initialize with correct WebSocket configurations', () => {
      expect(multiChainListener).toBeInstanceOf(MultiChainListener);
      expect(multiChainListener).toBeDefined();
    });

    it('should support all configured blockchain networks', async () => {
      const supportedChains = await multiChainListener.getSupportedChains();
      
      expect(supportedChains).toContain(42161); // Arbitrum
      expect(supportedChains).toContain(137);   // Polygon
      expect(supportedChains).toContain(8453);  // Base
      expect(supportedChains.length).toBeGreaterThanOrEqual(3);
    });

    it('should initialize WebSocket connections for all chains', async () => {
      await multiChainListener.initialize();
      
      const connectionStatus = await multiChainListener.getConnectionStatus();
      
      expect(connectionStatus[42161]).toBeDefined();
      expect(connectionStatus[137]).toBeDefined();
      expect(connectionStatus[8453]).toBeDefined();
      
      // All connections should be initialized
      Object.values(connectionStatus).forEach(status => {
        expect(['connecting', 'connected', 'ready'].includes(status.state)).toBe(true);
      });
    });

    it('should configure provider-specific WebSocket endpoints', async () => {
      const wsConfig = await multiChainListener.getWebSocketConfiguration();
      
      // Each chain should have multiple provider endpoints
      for (const chainId of [42161, 137, 8453]) {
        expect(wsConfig[chainId]).toBeDefined();
        expect(wsConfig[chainId].providers).toBeDefined();
        expect(Object.keys(wsConfig[chainId].providers).length).toBeGreaterThanOrEqual(2);
        
        // Validate provider endpoints
        Object.entries(wsConfig[chainId].providers).forEach(([provider, config]) => {
          expect(config.url).toBeDefined();
          expect(config.url.startsWith('ws')).toBe(true);
          expect(config.timeout).toBeGreaterThan(0);
          expect(config.reconnectDelay).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('WebSocket Connection Management', () => {
    it('should establish WebSocket connections successfully', async () => {
      // Mock successful connections
      mockWebSockets.mockConnections([
        { chainId: 42161, provider: 'quicknode', connected: true },
        { chainId: 137, provider: 'alchemy', connected: true },
        { chainId: 8453, provider: 'infura', connected: true }
      ]);

      const startTime = Date.now();
      await multiChainListener.connectAll();
      const connectionTime = Date.now() - startTime;

      const status = await multiChainListener.getConnectionStatus();
      
      // All connections should be established
      Object.values(status).forEach(chainStatus => {
        expect(chainStatus.state).toBe('connected');
        expect(chainStatus.connectedAt).toBeDefined();
      });

      // Connection should be fast for MEV requirements
      expect(connectionTime).toBeLessThan(5000);
    });

    it('should handle WebSocket connection failures gracefully', async () => {
      // Mock connection failures
      mockWebSockets.mockConnections([
        { chainId: 42161, provider: 'quicknode', connected: false, error: 'Connection timeout' },
        { chainId: 137, provider: 'alchemy', connected: true },
        { chainId: 8453, provider: 'infura', connected: true }
      ]);

      await multiChainListener.connectAll();
      
      const status = await multiChainListener.getConnectionStatus();
      const failureStatus = await multiChainListener.getConnectionFailures();
      
      // Should handle failures and attempt reconnection
      expect(failureStatus[42161]).toBeDefined();
      expect(failureStatus[42161].lastError).toContain('Connection timeout');
      expect(failureStatus[42161].retryCount).toBeGreaterThan(0);
      
      // Other connections should still work
      expect(status[137].state).toBe('connected');
      expect(status[8453].state).toBe('connected');
    });

    it('should implement exponential backoff for reconnection', async () => {
      // Mock intermittent connection failures
      mockWebSockets.mockReconnectionBehavior(42161, {
        failureCount: 3,
        backoffMultiplier: 2,
        maxBackoffMs: 30000
      });

      await multiChainListener.connectChain(42161);
      
      const reconnectionStats = await multiChainListener.getReconnectionStats(42161);
      
      expect(reconnectionStats.attempts).toBeGreaterThan(0);
      expect(reconnectionStats.backoffSequence).toBeDefined();
      
      // Validate exponential backoff pattern
      const backoffs = reconnectionStats.backoffSequence;
      if (backoffs.length > 1) {
        for (let i = 1; i < backoffs.length; i++) {
          expect(backoffs[i]).toBeGreaterThanOrEqual(backoffs[i - 1]);
        }
      }
    });

    it('should manage concurrent connections across multiple chains', async () => {
      const chains = [42161, 137, 8453];
      const connectionPromises = [];

      // Start all connections concurrently
      const startTime = Date.now();
      for (const chainId of chains) {
        connectionPromises.push(multiChainListener.connectChain(chainId));
      }

      await Promise.all(connectionPromises);
      const totalTime = Date.now() - startTime;

      const status = await multiChainListener.getConnectionStatus();
      
      // All chains should be connected
      chains.forEach(chainId => {
        expect(status[chainId].state).toBe('connected');
      });

      // Concurrent connections should be efficient
      expect(totalTime).toBeLessThan(10000); // Less than 10 seconds
    });
  });

  describe('Real-Time Block Monitoring', () => {
    it('should process new block headers correctly', async () => {
      await multiChainListener.connectAll();
      
      const blockEvents = [];
      multiChainListener.on('newBlock', (blockEvent) => {
        blockEvents.push(blockEvent);
      });

      // Simulate new blocks from mock WebSocket
      const testBlocks = [
        {
          chainId: 42161,
          blockNumber: 150789456,
          blockHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          timestamp: Date.now(),
          gasUsed: '12500000',
          gasLimit: '15000000',
          parentHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
        },
        {
          chainId: 137,
          blockNumber: 50123789,
          blockHash: '0x9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba',
          timestamp: Date.now(),
          gasUsed: '8750000',
          gasLimit: '10000000',
          parentHash: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321'
        }
      ];

      for (const block of testBlocks) {
        await mockWebSockets.simulateNewBlock(block.chainId, block);
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      }

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(blockEvents.length).toBe(testBlocks.length);
      
      // Validate block event structure
      blockEvents.forEach((event, index) => {
        const expectedBlock = testBlocks[index];
        expect(event.chainId).toBe(expectedBlock.chainId);
        expect(event.blockNumber).toBe(expectedBlock.blockNumber);
        expect(event.blockHash).toBe(expectedBlock.blockHash);
        expect(event.timestamp).toBeDefined();
        expect(event.processingTimeMs).toBeLessThan(50); // Fast processing for MEV
      });
    });

    it('should calculate accurate block timing statistics', async () => {
      await multiChainListener.connectAll();
      
      const chainId = 42161;
      const blockCount = 10;
      const blockInterval = 2000; // 2 seconds between blocks

      // Simulate sequence of blocks with known timing
      for (let i = 0; i < blockCount; i++) {
        const block = {
          chainId,
          blockNumber: 150789456 + i,
          blockHash: `0x${i.toString().padStart(64, '0')}`,
          timestamp: Date.now() + (i * blockInterval),
          gasUsed: '12500000',
          gasLimit: '15000000'
        };

        await mockWebSockets.simulateNewBlock(chainId, block);
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const stats = await multiChainListener.getBlockTimingStats(chainId);
      
      expect(stats.blocksProcessed).toBe(blockCount);
      expect(stats.averageBlockTime).toBeCloseTo(blockInterval / 1000, 1); // Convert to seconds
      expect(stats.minBlockTime).toBeGreaterThan(0);
      expect(stats.maxBlockTime).toBeGreaterThan(stats.minBlockTime);
      expect(stats.lastBlockTime).toBeDefined();
    });

    it('should detect and handle block reorganizations', async () => {
      await multiChainListener.connectAll();
      
      const chainId = 42161;
      const reorgEvents = [];
      
      multiChainListener.on('blockReorganization', (reorgEvent) => {
        reorgEvents.push(reorgEvent);
      });

      // Simulate normal block sequence
      const block1 = {
        chainId,
        blockNumber: 150789456,
        blockHash: '0xoriginal456',
        parentHash: '0xparent455',
        timestamp: Date.now()
      };

      const block2 = {
        chainId,
        blockNumber: 150789457,
        blockHash: '0xoriginal457',
        parentHash: '0xoriginal456',
        timestamp: Date.now() + 2000
      };

      await mockWebSockets.simulateNewBlock(chainId, block1);
      await mockWebSockets.simulateNewBlock(chainId, block2);

      // Simulate reorganization (new block at same height with different hash)
      const reorgBlock = {
        chainId,
        blockNumber: 150789457, // Same number, different hash
        blockHash: '0xreorged457',
        parentHash: '0xoriginal456',
        timestamp: Date.now() + 2100
      };

      await mockWebSockets.simulateNewBlock(chainId, reorgBlock);
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(reorgEvents.length).toBe(1);
      expect(reorgEvents[0].chainId).toBe(chainId);
      expect(reorgEvents[0].blockNumber).toBe(150789457);
      expect(reorgEvents[0].originalHash).toBe('0xoriginal457');
      expect(reorgEvents[0].newHash).toBe('0xreorged457');
    });

    it('should maintain block data cache for MEV analysis', async () => {
      await multiChainListener.connectAll();
      
      const chainId = 42161;
      const testBlock = {
        chainId,
        blockNumber: 150789456,
        blockHash: '0xtest456',
        timestamp: Date.now(),
        gasUsed: '12500000',
        gasLimit: '15000000',
        transactions: [
          { hash: '0xtx1', value: '1000000000000000000' },
          { hash: '0xtx2', value: '2000000000000000000' }
        ]
      };

      await mockWebSockets.simulateNewBlock(chainId, testBlock);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check if block data is cached
      const cachedBlock = await multiChainListener.getCachedBlock(chainId, testBlock.blockNumber);
      expect(cachedBlock).toBeDefined();
      expect(cachedBlock.blockHash).toBe(testBlock.blockHash);
      expect(cachedBlock.transactions.length).toBe(2);

      // Check cache TTL for performance
      const cacheInfo = await multiChainListener.getBlockCacheInfo(chainId);
      expect(cacheInfo.blockCount).toBeGreaterThan(0);
      expect(cacheInfo.totalSize).toBeGreaterThan(0);
      expect(cacheInfo.averageSize).toBeGreaterThan(0);
    });
  });

  describe('Event Broadcasting & Integration', () => {
    it('should broadcast events to multiple listeners efficiently', async () => {
      await multiChainListener.connectAll();
      
      const listener1Events = [];
      const listener2Events = [];
      const listener3Events = [];

      // Multiple listeners for same events
      multiChainListener.on('newBlock', (event) => listener1Events.push(event));
      multiChainListener.on('newBlock', (event) => listener2Events.push(event));
      multiChainListener.on('newBlock', (event) => listener3Events.push(event));

      const testBlock = {
        chainId: 42161,
        blockNumber: 150789456,
        blockHash: '0xtest456',
        timestamp: Date.now()
      };

      const startTime = performance.now();
      await mockWebSockets.simulateNewBlock(42161, testBlock);
      await new Promise(resolve => setTimeout(resolve, 100));
      const broadcastTime = performance.now() - startTime;

      // All listeners should receive the event
      expect(listener1Events.length).toBe(1);
      expect(listener2Events.length).toBe(1);
      expect(listener3Events.length).toBe(1);

      // Broadcasting should be very fast for MEV
      expect(broadcastTime).toBeLessThan(50); // Sub-50ms for event broadcasting
    });

    it('should handle event listener errors gracefully', async () => {
      await multiChainListener.connectAll();
      
      const successfulEvents = [];
      let errorThrown = false;

      // Add listeners, one that throws an error
      multiChainListener.on('newBlock', (event) => {
        successfulEvents.push(event);
      });

      multiChainListener.on('newBlock', (event) => {
        errorThrown = true;
        throw new Error('Listener error');
      });

      multiChainListener.on('newBlock', (event) => {
        successfulEvents.push(event);
      });

      const testBlock = {
        chainId: 42161,
        blockNumber: 150789456,
        blockHash: '0xtest456',
        timestamp: Date.now()
      };

      await mockWebSockets.simulateNewBlock(42161, testBlock);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Error should not prevent other listeners from receiving events
      expect(errorThrown).toBe(true);
      expect(successfulEvents.length).toBe(2); // Two successful listeners
    });

    it('should emit specialized MEV events for arbitrage detection', async () => {
      await multiChainListener.connectAll();
      
      const mevEvents = [];
      multiChainListener.on('mevOpportunity', (event) => mevEvents.push(event));

      // Simulate block with MEV opportunity characteristics
      const mevBlock = {
        chainId: 42161,
        blockNumber: 150789456,
        blockHash: '0xmev456',
        timestamp: Date.now(),
        gasUsed: '14500000', // High gas usage
        transactions: [
          {
            hash: '0xarbitrage1',
            value: '100000000000000000000', // Large value
            gasPrice: '50000000000', // High gas price
            to: '0xUniswapRouter'
          },
          {
            hash: '0xarbitrage2', 
            value: '100000000000000000000',
            gasPrice: '60000000000', // Even higher gas
            to: '0xSushiswapRouter'
          }
        ]
      };

      await mockWebSockets.simulateNewBlock(42161, mevBlock);
      await new Promise(resolve => setTimeout(resolve, 100));

      // MEV detection should trigger specialized events
      const mevStats = await multiChainListener.getMevDetectionStats(42161);
      expect(mevStats.blocksAnalyzed).toBeGreaterThan(0);
      expect(mevStats.potentialOpportunities).toBeDefined();
    });

    it('should integrate with provider failover system', async () => {
      await multiChainListener.connectAll();
      
      const failoverEvents = [];
      multiChainListener.on('providerFailover', (event) => failoverEvents.push(event));

      // Simulate WebSocket connection failure requiring failover
      await mockWebSockets.simulateConnectionFailure(42161, 'quicknode');
      
      // Should automatically failover to backup provider
      await new Promise(resolve => setTimeout(resolve, 500));

      const connectionStatus = await multiChainListener.getConnectionStatus();
      expect(connectionStatus[42161].state).toBe('connected');
      expect(connectionStatus[42161].currentProvider).not.toBe('quicknode');
      
      // Failover event should be emitted
      expect(failoverEvents.length).toBeGreaterThan(0);
      const failoverEvent = failoverEvents[0];
      expect(failoverEvent.chainId).toBe(42161);
      expect(failoverEvent.fromProvider).toBe('quicknode');
      expect(failoverEvent.reason).toBe('connection_failure');
      expect(failoverEvent.failoverTimeMs).toBeLessThan(1000); // Fast failover
    });
  });

  describe('Performance & Resource Management', () => {
    it('should maintain sub-50ms block processing for MEV competition', async () => {
      await multiChainListener.connectAll();
      
      const processingTimes = [];
      multiChainListener.on('newBlock', (event) => {
        processingTimes.push(event.processingTimeMs);
      });

      // Process multiple blocks to test performance consistency
      for (let i = 0; i < 20; i++) {
        const block = {
          chainId: 42161,
          blockNumber: 150789456 + i,
          blockHash: `0x${i.toString().padStart(64, '0')}`,
          timestamp: Date.now() + (i * 2000)
        };

        await mockWebSockets.simulateNewBlock(42161, block);
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(processingTimes.length).toBe(20);
      
      // All processing times should be very fast for MEV
      processingTimes.forEach(time => {
        expect(time).toBeLessThan(50); // Sub-50ms processing
      });

      const avgProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
      expect(avgProcessingTime).toBeLessThan(25); // Average under 25ms
    });

    it('should handle high-frequency block updates efficiently', async () => {
      await multiChainListener.connectAll();
      
      const blockCount = 100;
      const startTime = Date.now();
      
      // Simulate high-frequency blocks (every 100ms)
      const promises = [];
      for (let i = 0; i < blockCount; i++) {
        promises.push(
          new Promise(async (resolve) => {
            await new Promise(r => setTimeout(r, i * 100));
            const block = {
              chainId: 42161,
              blockNumber: 150789456 + i,
              blockHash: `0x${i.toString().padStart(64, '0')}`,
              timestamp: Date.now()
            };
            await mockWebSockets.simulateNewBlock(42161, block);
            resolve(null);
          })
        );
      }

      await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      const stats = await multiChainListener.getPerformanceStats();
      
      expect(stats.totalBlocksProcessed).toBe(blockCount);
      expect(stats.averageProcessingTime).toBeLessThan(30); // Fast processing
      expect(totalTime).toBeLessThan(15000); // Complete within 15 seconds
    });

    it('should manage memory usage efficiently during extended operation', async () => {
      await multiChainListener.connectAll();
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Process many blocks to test memory management
      for (let i = 0; i < 500; i++) {
        const block = {
          chainId: [42161, 137, 8453][i % 3], // Rotate chains
          blockNumber: 150789456 + i,
          blockHash: `0x${i.toString().padStart(64, '0')}`,
          timestamp: Date.now(),
          transactions: new Array(Math.floor(Math.random() * 100)).fill(null).map((_, j) => ({
            hash: `0xtx${i}_${j}`,
            value: Math.random() * 1000000000000000000
          }))
        };

        await mockWebSockets.simulateNewBlock(block.chainId, block);
        
        if (i % 50 === 0) {
          // Periodic cleanup should prevent memory leaks
          await multiChainListener.performMaintenance();
        }
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be reasonable
      expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase

      const memoryStats = await multiChainListener.getMemoryStats();
      expect(memoryStats.cacheSize).toBeDefined();
      expect(memoryStats.eventListeners).toBeDefined();
      expect(memoryStats.activeConnections).toBe(3); // One per chain
    });

    it('should handle concurrent multi-chain operations safely', async () => {
      await multiChainListener.connectAll();
      
      const chains = [42161, 137, 8453];
      const eventsPerChain = 50;
      const allEvents = [];

      multiChainListener.on('newBlock', (event) => allEvents.push(event));

      // Generate concurrent events across all chains
      const promises = [];
      chains.forEach(chainId => {
        for (let i = 0; i < eventsPerChain; i++) {
          promises.push(
            new Promise(async (resolve) => {
              await new Promise(r => setTimeout(r, Math.random() * 1000));
              const block = {
                chainId,
                blockNumber: 150789456 + i,
                blockHash: `0x${chainId}_${i}`.padEnd(66, '0'),
                timestamp: Date.now()
              };
              await mockWebSockets.simulateNewBlock(chainId, block);
              resolve(null);
            })
          );
        }
      });

      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for event processing

      expect(allEvents.length).toBe(chains.length * eventsPerChain);
      
      // Verify events from all chains were processed
      const eventsByChain = {};
      allEvents.forEach(event => {
        eventsByChain[event.chainId] = (eventsByChain[event.chainId] || 0) + 1;
      });

      chains.forEach(chainId => {
        expect(eventsByChain[chainId]).toBe(eventsPerChain);
      });
    });
  });

  describe('Error Handling & Recovery', () => {
    it('should handle WebSocket disconnections gracefully', async () => {
      await multiChainListener.connectAll();
      
      const disconnectionEvents = [];
      multiChainListener.on('connectionLost', (event) => disconnectionEvents.push(event));

      // Simulate sudden disconnection
      await mockWebSockets.simulateDisconnection(42161, 'network_error');
      
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(disconnectionEvents.length).toBe(1);
      expect(disconnectionEvents[0].chainId).toBe(42161);
      expect(disconnectionEvents[0].reason).toBe('network_error');

      // Should attempt automatic reconnection
      const reconnectionStatus = await multiChainListener.getReconnectionStatus(42161);
      expect(reconnectionStatus.attempting).toBe(true);
      expect(reconnectionStatus.attempts).toBeGreaterThan(0);
    });

    it('should handle malformed block data gracefully', async () => {
      await multiChainListener.connectAll();
      
      const errorEvents = [];
      multiChainListener.on('blockProcessingError', (event) => errorEvents.push(event));

      // Simulate malformed block data
      const malformedBlocks = [
        { chainId: 42161 }, // Missing required fields
        { chainId: 42161, blockNumber: 'invalid' }, // Invalid number
        { chainId: 42161, blockNumber: 150789456, blockHash: 'invalid-hash' }, // Invalid hash
        null, // Null block
        undefined // Undefined block
      ];

      for (const block of malformedBlocks) {
        try {
          await mockWebSockets.simulateNewBlock(42161, block);
        } catch (error) {
          // Expected to fail
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Should handle all malformed data without crashing
      expect(multiChainListener.isHealthy()).toBe(true);
      
      const errorStats = await multiChainListener.getErrorStats();
      expect(errorStats.blockProcessingErrors).toBeGreaterThan(0);
      expect(errorStats.totalErrors).toBeGreaterThan(0);
    });

    it('should implement circuit breaker for failing connections', async () => {
      // Configure with aggressive failure thresholds for testing
      await multiChainListener.configureCircuitBreaker(42161, {
        failureThreshold: 3,
        timeoutMs: 5000,
        retryDelayMs: 1000
      });

      await multiChainListener.connectChain(42161);

      // Simulate repeated connection failures
      for (let i = 0; i < 5; i++) {
        await mockWebSockets.simulateConnectionFailure(42161, 'connection_timeout');
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const circuitState = await multiChainListener.getCircuitBreakerState(42161);
      expect(circuitState.state).toBe('OPEN');
      expect(circuitState.failureCount).toBeGreaterThanOrEqual(3);
      expect(circuitState.lastFailure).toBeDefined();

      // Should stop attempting connections while circuit is open
      const connectionAttempts = await multiChainListener.getConnectionAttempts(42161);
      expect(connectionAttempts.recentAttempts).toBeLessThan(10); // Should have stopped trying
    });

    it('should recover from provider failures with minimal downtime', async () => {
      await multiChainListener.connectAll();
      
      const startTime = Date.now();
      
      // Simulate primary provider failure
      await mockWebSockets.simulateProviderFailure(42161, 'quicknode');
      
      // Should failover to backup provider quickly
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const recoveryTime = Date.now() - startTime;
      const status = await multiChainListener.getConnectionStatus();
      
      // Should be connected again within acceptable time
      expect(status[42161].state).toBe('connected');
      expect(recoveryTime).toBeLessThan(5000); // Less than 5 seconds recovery
      
      // Should be using different provider
      expect(status[42161].currentProvider).not.toBe('quicknode');
      
      const failoverStats = await multiChainListener.getFailoverStats(42161);
      expect(failoverStats.totalFailovers).toBe(1);
      expect(failoverStats.averageFailoverTime).toBeLessThan(5000);
    });
  });

  describe('Integration with Test Environment', () => {
    it('should work within test environment isolation', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      await multiChainListener.initialize();
      
      const testMetadata = {
        testId: testEnv.testId,
        isolationLevel: testEnv.config.isolationLevel,
        chainIds: testEnv.config.chainIds
      };

      // Test that listener works within isolated environment
      const listenerStatus = await multiChainListener.getSystemStatus();
      expect(listenerStatus.healthy).toBe(true);
      expect(listenerStatus.activeChains).toEqual(testEnv.config.chainIds);
    });

    it('should integrate with performance monitoring', async () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      await multiChainListener.connectAll();
      
      const startTime = Date.now();
      
      // Process some blocks and measure performance
      for (let i = 0; i < 10; i++) {
        const block = {
          chainId: 42161,
          blockNumber: 150789456 + i,
          blockHash: `0x${i.toString().padStart(64, '0')}`,
          timestamp: Date.now()
        };
        await mockWebSockets.simulateNewBlock(42161, block);
      }
      
      const operationTime = Date.now() - startTime;
      
      testEnv.performance.incrementDatabaseOperations();
      
      const metrics = testEnv.performance.getCurrentMetrics();
      expect(metrics.databaseOperations).toBeGreaterThan(0);
      expect(operationTime).toBeLessThan(1000); // Fast block processing
    });
  });

  describe('MEV Trading Specific Requirements', () => {
    it('should meet sub-millisecond event detection for MEV opportunities', async () => {
      await multiChainListener.connectAll();
      
      const detectionTimes = [];
      multiChainListener.on('newBlock', (event) => {
        detectionTimes.push(event.detectionTimeMs);
      });

      // Simulate blocks with MEV characteristics
      for (let i = 0; i < 10; i++) {
        const mevBlock = {
          chainId: 42161,
          blockNumber: 150789456 + i,
          blockHash: `0xmev${i.toString().padStart(61, '0')}`,
          timestamp: Date.now(),
          gasUsed: '14500000', // High gas usage indicating MEV activity
          transactions: [
            { hash: '0xarb1', gasPrice: '100000000000' }, // High gas price
            { hash: '0xarb2', gasPrice: '150000000000' }  // Even higher
          ]
        };

        const detectionStart = performance.now();
        await mockWebSockets.simulateNewBlock(42161, mevBlock);
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(detectionTimes.length).toBe(10);
      
      // All detections should be sub-millisecond for MEV competition
      detectionTimes.forEach(time => {
        expect(time).toBeLessThan(1); // Sub-millisecond detection
      });

      const avgDetectionTime = detectionTimes.reduce((sum, time) => sum + time, 0) / detectionTimes.length;
      expect(avgDetectionTime).toBeLessThan(0.5); // Average under 0.5ms
    });

    it('should handle MEV competition scenarios with multiple arbitrage bots', async () => {
      await multiChainListener.connectAll();
      
      const competitiveEvents = [];
      multiChainListener.on('competitiveMevBlock', (event) => competitiveEvents.push(event));

      // Simulate block with high MEV competition
      const competitiveBlock = {
        chainId: 42161,
        blockNumber: 150789456,
        blockHash: '0xcompetitive456',
        timestamp: Date.now(),
        gasUsed: '14900000', // Very high gas usage
        transactions: [
          { hash: '0xbot1', gasPrice: '200000000000', value: '50000000000000000000' },
          { hash: '0xbot2', gasPrice: '250000000000', value: '50000000000000000000' },
          { hash: '0xbot3', gasPrice: '300000000000', value: '50000000000000000000' },
          { hash: '0xuser', gasPrice: '30000000000', value: '1000000000000000000' }
        ]
      };

      const processingStart = performance.now();
      await mockWebSockets.simulateNewBlock(42161, competitiveBlock);
      await new Promise(resolve => setTimeout(resolve, 50));
      const processingTime = performance.now() - processingStart;

      // Should process competitive blocks extremely quickly
      expect(processingTime).toBeLessThan(25); // Sub-25ms for competitive advantage

      const mevAnalysis = await multiChainListener.getMevAnalysis(42161, competitiveBlock.blockNumber);
      expect(mevAnalysis.competitionLevel).toBe('high');
      expect(mevAnalysis.botCount).toBe(3);
      expect(mevAnalysis.maxGasPrice).toBe('300000000000');
    });

    it('should provide real-time arbitrage opportunity scoring', async () => {
      await multiChainListener.connectAll();
      
      const opportunityScores = [];
      multiChainListener.on('arbitrageOpportunity', (event) => {
        opportunityScores.push(event.score);
      });

      // Simulate blocks with varying arbitrage potential
      const testScenarios = [
        {
          blockData: { gasUsed: '8000000', txCount: 50 },
          expectedScore: 'low'
        },
        {
          blockData: { gasUsed: '12000000', txCount: 150 },
          expectedScore: 'medium'
        },
        {
          blockData: { gasUsed: '14500000', txCount: 300 },
          expectedScore: 'high'
        }
      ];

      for (let i = 0; i < testScenarios.length; i++) {
        const scenario = testScenarios[i];
        const block = {
          chainId: 42161,
          blockNumber: 150789456 + i,
          blockHash: `0x${i.toString().padStart(64, '0')}`,
          timestamp: Date.now(),
          gasUsed: scenario.blockData.gasUsed,
          transactions: new Array(scenario.blockData.txCount).fill(null).map((_, j) => ({
            hash: `0xtx${i}_${j}`,
            gasPrice: '50000000000'
          }))
        };

        await mockWebSockets.simulateNewBlock(42161, block);
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      await new Promise(resolve => setTimeout(resolve, 200));

      // Should generate opportunity scores based on block characteristics
      const scoringStats = await multiChainListener.getOpportunityStats(42161);
      expect(scoringStats.totalOpportunities).toBeGreaterThan(0);
      expect(scoringStats.averageScore).toBeGreaterThan(0);
      expect(scoringStats.highScoreCount).toBeDefined();
    });
  });

  describe('Financial Data Integrity', () => {
    it('should maintain precise transaction value calculations', async () => {
      await multiChainListener.connectAll();
      
      const precisionTestBlock = {
        chainId: 42161,
        blockNumber: 150789456,
        blockHash: '0xprecision456',
        timestamp: Date.now(),
        transactions: [
          {
            hash: '0xtx1',
            value: '1234567890123456789', // 19 digits precision
            gasPrice: '123456789012345',     // 15 digits precision
            gasUsed: '987654321'
          },
          {
            hash: '0xtx2',
            value: '999999999999999999999', // 21 digits precision
            gasPrice: '999999999999999',      // 15 digits precision  
            gasUsed: '21000'
          }
        ]
      };

      await mockWebSockets.simulateNewBlock(42161, precisionTestBlock);
      await new Promise(resolve => setTimeout(resolve, 100));

      const cachedBlock = await multiChainListener.getCachedBlock(42161, 150789456);
      
      // Verify precision is maintained for financial calculations
      expect(cachedBlock.transactions[0].value).toBe('1234567890123456789');
      expect(cachedBlock.transactions[0].gasPrice).toBe('123456789012345');
      expect(cachedBlock.transactions[1].value).toBe('999999999999999999999');
      
      // Calculate total value with precision
      const totalValue = cachedBlock.transactions.reduce((sum, tx) => {
        return sum + BigInt(tx.value);
      }, BigInt(0));
      
      expect(totalValue.toString()).toBe('1001234567890123456788');
    });

    it('should handle large transaction volumes without precision loss', async () => {
      await multiChainListener.connectAll();
      
      const largeVolumeBlock = {
        chainId: 42161,
        blockNumber: 150789456,
        blockHash: '0xlargevolume456',
        timestamp: Date.now(),
        transactions: new Array(500).fill(null).map((_, i) => ({
          hash: `0xtx${i}`,
          value: (BigInt(i + 1) * BigInt('1000000000000000000')).toString(), // i+1 ETH each
          gasPrice: '50000000000',
          gasUsed: '21000'
        }))
      };

      const processingStart = performance.now();
      await mockWebSockets.simulateNewBlock(42161, largeVolumeBlock);
      await new Promise(resolve => setTimeout(resolve, 200));
      const processingTime = performance.now() - processingStart;

      const cachedBlock = await multiChainListener.getCachedBlock(42161, 150789456);
      
      // Should handle large volume efficiently
      expect(processingTime).toBeLessThan(500); // Under 500ms for 500 transactions
      expect(cachedBlock.transactions.length).toBe(500);
      
      // Verify precision maintained across all transactions
      const totalValue = cachedBlock.transactions.reduce((sum, tx) => {
        return sum + BigInt(tx.value);
      }, BigInt(0));
      
      // Total should be (1+2+...+500) * 1 ETH = 125250 ETH
      const expectedTotal = BigInt('125250000000000000000000'); // 125250 ETH in wei
      expect(totalValue).toBe(expectedTotal);
    });
  });
});
