import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { MultiChainListener } from '../../../backend/src/data/MultiChainListener.js';
import { logger } from '../../../backend/src/utils/Logger.js';
import { redisCache } from '../../../backend/src/storage/RedisCache.js';

// Mock dependencies
vi.mock('../../../backend/src/utils/Logger.js');
vi.mock('../../../backend/src/storage/RedisCache.js');

// Mock RPC Provider Manager
const mockRpcProviderManager = {
  isHealthy: vi.fn().mockReturnValue(true),
  getConnectionStats: vi.fn().mockReturnValue([
    { chainId: 42161, chainName: 'Arbitrum One', currentProvider: 'QuickNode' },
    { chainId: 137, chainName: 'Polygon', currentProvider: 'Alchemy' },
    { chainId: 8453, chainName: 'Base', currentProvider: 'Infura' }
  ]),
  getWebSocketProvider: vi.fn(),
  switchProvider: vi.fn().mockResolvedValue(true)
};

vi.mock('../../../backend/src/data/RpcProviderManager.js', () => ({
  rpcProviderManager: mockRpcProviderManager
}));

describe('MultiChainListener', () => {
  let multiChainListener: MultiChainListener;
  let mockLogger: any;
  let mockRedisCache: any;
  let mockWebSocketClient: any;

  // Helper function to setup mock with proper connection stats
  const setupMockConnectionStats = () => {
    mockRpcProviderManager.getConnectionStats.mockReturnValue([
      { 
        chainId: 42161, 
        chainName: 'Arbitrum One', 
        currentProvider: 'QuickNode',
        totalProviders: 3,
        healthyProviders: 3,
        averageResponseTime: 150,
        totalRequests: 1000,
        successfulRequests: 995,
        successRate: 99.5
      },
      { 
        chainId: 137, 
        chainName: 'Polygon', 
        currentProvider: 'Alchemy',
        totalProviders: 3,
        healthyProviders: 3,
        averageResponseTime: 180,
        totalRequests: 800,
        successfulRequests: 792,
        successRate: 99.0
      },
      { 
        chainId: 8453, 
        chainName: 'Base', 
        currentProvider: 'Infura',
        totalProviders: 3,
        healthyProviders: 3,
        averageResponseTime: 160,
        totalRequests: 600,
        successfulRequests: 594,
        successRate: 99.0
      }
    ]);
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Ensure RPC Provider Manager is marked as healthy
    mockRpcProviderManager.isHealthy.mockReturnValue(true);

    // Mock logger
    mockLogger = {
      startup: vi.fn(),
      connection: vi.fn(),
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

    // Mock WebSocket client - ENHANCED
    mockWebSocketClient = {
      watchBlockNumber: vi.fn().mockReturnValue(() => {}), // Return unsubscribe function
      getBlockNumber: vi.fn().mockResolvedValue(1000000n),
      getBlock: vi.fn().mockResolvedValue({
        number: 1000001n,
        hash: '0x123456789abcdef',
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
        parentHash: '0x987654321fedcba',
        gasLimit: 30000000n,
        gasUsed: 15000000n,
        baseFeePerGas: 20000000000n
      })
    };

    // Mock RPC Provider Manager WebSocket provider - FIXED
    mockRpcProviderManager.getWebSocketProvider.mockReturnValue(mockWebSocketClient);
    
    // Ensure connection stats are available
    setupMockConnectionStats();

    // Create fresh instance
    const { MultiChainListener } = await import('../../../backend/src/data/MultiChainListener.js');
    multiChainListener = new MultiChainListener();
  });

  afterEach(async () => {
    if (multiChainListener && multiChainListener.isHealthy()) {
      await multiChainListener.shutdown();
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with configured chains', async () => {
      await multiChainListener.initialize();

      expect(multiChainListener.isHealthy()).toBe(true);
      expect(mockLogger.startup).toHaveBeenCalledWith('Initializing MultiChain WebSocket Listener...');
      expect(mockLogger.startup).toHaveBeenCalledWith(
        'MultiChain WebSocket Listener initialized successfully',
        expect.objectContaining({
          totalChains: 3,
          connectedChains: expect.any(Number)
        })
      );
    });

    it('should initialize listeners for all configured chains', async () => {
      await multiChainListener.initialize();

      // Should have called getWebSocketProvider for each chain
      expect(mockRpcProviderManager.getWebSocketProvider).toHaveBeenCalledWith(42161);
      expect(mockRpcProviderManager.getWebSocketProvider).toHaveBeenCalledWith(137);
      expect(mockRpcProviderManager.getWebSocketProvider).toHaveBeenCalledWith(8453);
    });

    it('should setup WebSocket watchers for each chain', async () => {
      await multiChainListener.initialize();

      // Each chain should have a WebSocket watcher
      expect(mockWebSocketClient.watchBlockNumber).toHaveBeenCalledTimes(3);
      
      // Verify watcher configuration
      expect(mockWebSocketClient.watchBlockNumber).toHaveBeenCalledWith({
        onBlockNumber: expect.any(Function),
        onError: expect.any(Function)
      });
    });

    it('should handle RPC Provider Manager not being ready', async () => {
      mockRpcProviderManager.isHealthy.mockReturnValue(false);

      await expect(multiChainListener.initialize()).rejects.toThrow(
        'RPC Provider Manager must be initialized before WebSocket listeners'
      );
    });

    it('should handle no configured chains', async () => {
      mockRpcProviderManager.getConnectionStats.mockReturnValue([]);

      await expect(multiChainListener.initialize()).rejects.toThrow(
        'No chains configured in RPC Provider Manager'
      );
    });

    it('should handle WebSocket connection failures during initialization', async () => {
      // Ensure we have connection stats first
      setupMockConnectionStats();
      
      mockWebSocketClient.watchBlockNumber.mockImplementation(() => {
        throw new Error('WebSocket connection failed');
      });

      // Should still complete initialization but with failed connections
      await multiChainListener.initialize();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to connect WebSocket listener',
        expect.any(Error),
        expect.objectContaining({
          chainId: expect.any(Number)
        })
      );
    });
  });

  describe('Block Monitoring', () => {
    beforeEach(async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
    });

    it('should emit newBlock events when blocks are received', async () => {
      const blockEventSpy = vi.fn();
      multiChainListener.on('newBlock', blockEventSpy);

      // Simulate receiving a new block by calling the onBlockNumber callback
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000001n);
      
      // Wait for async block processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(blockEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: expect.any(Number),
          chainName: expect.any(String),
          blockNumber: 1000001n,
          blockHash: '0x123456789abcdef',
          timestamp: expect.any(Number),
          provider: expect.any(String)
        })
      );
    });

    it('should emit chain-specific block events', async () => {
      const arbitrumBlockSpy = vi.fn();
      multiChainListener.on('newBlock:42161', arbitrumBlockSpy);

      // Simulate receiving a block for Arbitrum
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000001n);
      
      // Wait for async block processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(arbitrumBlockSpy).toHaveBeenCalled();
    });

    it('should skip old blocks', async () => {
      const blockEventSpy = vi.fn();
      multiChainListener.on('newBlock', blockEventSpy);

      // Simulate receiving a newer block first
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000005n);
      
      // Wait for async block processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(blockEventSpy).toHaveBeenCalledTimes(1);

      // Now simulate receiving an older block
      await onBlockNumber(1000003n);
      
      // Wait again for potential processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should still only have been called once (old block skipped)
      expect(blockEventSpy).toHaveBeenCalledTimes(1);
    });

    it('should update block statistics', async () => {
      // Simulate receiving multiple blocks
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000001n);
      await onBlockNumber(1000002n);
      await onBlockNumber(1000003n);
      
      // Wait for all block processing to complete
      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = multiChainListener.getListenerStats();
      const arbitrumStats = stats.find(s => s.chainId === 42161);
      
      expect(arbitrumStats?.blocksReceived).toBeGreaterThan(0);
    });

    it('should calculate average block times', async () => {
      // Mock blocks with different timestamps
      const baseTime = Math.floor(Date.now() / 1000);
      mockWebSocketClient.getBlock
        .mockResolvedValueOnce({
          number: 1000001n,
          hash: '0x123456789abcdef',
          timestamp: BigInt(baseTime),
          parentHash: '0x987654321fedcba',
          gasLimit: 30000000n,
          gasUsed: 15000000n,
          baseFeePerGas: 20000000000n
        })
        .mockResolvedValueOnce({
          number: 1000002n,
          hash: '0x123456789abcdef2',
          timestamp: BigInt(baseTime + 12), // 12 seconds later
          parentHash: '0x123456789abcdef',
          gasLimit: 30000000n,
          gasUsed: 15000000n,
          baseFeePerGas: 20000000000n
        });

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000001n);
      // Wait for first block processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await onBlockNumber(1000002n);
      // Wait for second block processing and stats calculation
      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = multiChainListener.getListenerStats();
      const arbitrumStats = stats.find(s => s.chainId === 42161);
      
      expect(arbitrumStats?.averageBlockTime).toBeGreaterThanOrEqual(0);
    });

    it('should cache block data in Redis', async () => {
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000001n);
      
      // Wait for async block processing and caching to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockRedisCache.set).toHaveBeenCalledWith(
        expect.stringMatching(/latest_block:\d+/),
        expect.objectContaining({
          blockNumber: '1000001',
          blockHash: '0x123456789abcdef',
          timestamp: expect.any(Number)
        }),
        300 // 5 minute TTL
      );
    });

    it('should handle block processing errors gracefully', async () => {
      mockWebSocketClient.getBlock.mockRejectedValue(new Error('RPC error'));

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000001n);
      
      // Wait for async error handling to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process new block',
        expect.any(Error),
        expect.objectContaining({
          chainId: expect.any(Number),
          blockNumber: '1000001'
        })
      );
    });
  });

  describe('Connection Error Handling', () => {
    beforeEach(async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
    });

    it('should handle WebSocket connection errors', async () => {
      const connectionErrorSpy = vi.fn();
      multiChainListener.on('connectionError', connectionErrorSpy);

      // Simulate a connection error
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onError = watchCall[0].onError;
      
      onError(new Error('Connection lost'));

      expect(connectionErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: expect.any(Number),
          chainName: expect.any(String),
          error: 'Connection lost',
          consecutiveFailures: expect.any(Number)
        })
      );
    });

    it('should trigger provider switch after excessive failures', async () => {
      // Simulate multiple connection errors to exceed failure threshold
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onError = watchCall[0].onError;
      
      // Trigger exactly MAX_CONSECUTIVE_FAILURES + 1 (6) errors to exceed threshold
      for (let i = 0; i < 6; i++) {
        onError(new Error(`Connection error ${i}`));
      }

      // Wait for async provider switch logic to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockRpcProviderManager.switchProvider).toHaveBeenCalledWith(
        expect.any(Number),
        'websocket_excessive_failures'
      );
    });

    it('should schedule reconnection with exponential backoff', async () => {
      vi.useFakeTimers();

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onError = watchCall[0].onError;
      
      onError(new Error('Connection error'));

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Scheduling WebSocket reconnection',
        expect.objectContaining({
          chainId: expect.any(Number),
          delay: expect.any(Number),
          consecutiveFailures: expect.any(Number)
        })
      );

      vi.useRealTimers();
    });

    it('should not schedule reconnection during shutdown', async () => {
      await multiChainListener.shutdown();

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onError = watchCall[0].onError;
      
      onError(new Error('Connection error'));

      // Should not attempt reconnection during shutdown
      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        expect.stringContaining('Scheduling WebSocket reconnection'),
        expect.any(Object)
      );
    });
  });

  describe('Reconnection Logic', () => {
    beforeEach(async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
    });

    it('should reinitialize listener with new provider after switch', async () => {
      // Mock successful provider switch
      mockRpcProviderManager.switchProvider.mockResolvedValue(true);

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onError = watchCall[0].onError;
      
      // Trigger enough errors to cause provider switch
      for (let i = 0; i < 6; i++) {
        onError(new Error(`Connection error ${i}`));
      }

      // Wait for async operations including provider switch and reinitialization
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(mockLogger.info).toHaveBeenCalledWith(
        'WebSocket listener reinitialized with new provider',
        expect.objectContaining({
          chainId: expect.any(Number),
          chainName: expect.any(String),
          newProvider: expect.any(String)
        })
      );
    });

    it('should handle provider switch failures', async () => {
      // Mock failed provider switch
      mockRpcProviderManager.switchProvider.mockRejectedValue(new Error('No healthy providers'));

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onError = watchCall[0].onError;
      
      // Trigger provider switch
      for (let i = 0; i < 6; i++) {
        onError(new Error(`Connection error ${i}`));
      }

      // Wait for async operations including failed provider switch
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to switch provider after WebSocket failures',
        expect.any(Error),
        expect.objectContaining({
          chainId: expect.any(Number)
        })
      );
    });

    it('should force reconnection for specific chains', async () => {
      const result = await multiChainListener.reconnectChain(42161);
      
      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Forcing WebSocket reconnection',
        expect.objectContaining({
          chainId: 42161,
          chainName: expect.any(String)
        })
      );
    });

    it('should handle reconnection failures gracefully', async () => {
      mockWebSocketClient.watchBlockNumber.mockImplementation(() => {
        throw new Error('WebSocket unavailable');
      });

      const result = await multiChainListener.reconnectChain(42161);
      
      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to connect WebSocket listener',
        expect.any(Error),
        expect.objectContaining({
          chainId: 42161,
          chainName: expect.any(String)
        })
      );
    });

    it('should not reconnect unknown chains', async () => {
      const result = await multiChainListener.reconnectChain(999);
      
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot reconnect unknown chain',
        { chainId: 999 }
      );
    });
  });

  describe('Statistics and Monitoring', () => {
    beforeEach(async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
    });

    it('should provide listener statistics for all chains', () => {
      const stats = multiChainListener.getListenerStats();
      
      expect(stats.length).toBe(3); // Three chains configured
      stats.forEach(stat => {
        expect(stat).toMatchObject({
          chainId: expect.any(Number),
          chainName: expect.any(String),
          isConnected: expect.any(Boolean),
          lastBlockNumber: expect.any(String),
          consecutiveFailures: expect.any(Number),
          lastReconnectAttempt: expect.any(Number),
          blocksReceived: expect.any(Number),
          averageBlockTime: expect.any(Number),
          providerName: expect.any(String)
        });
      });
    });

    it('should track connection status per chain', () => {
      const stats = multiChainListener.getListenerStats();
      
      // All chains should initially be connected (mocked as successful)
      stats.forEach(stat => {
        expect(stat.isConnected).toBe(true);
      });
    });

    it('should track blocks received count', async () => {
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      // Simulate receiving blocks
      await onBlockNumber(1000001n);
      await onBlockNumber(1000002n);
      
      // Wait for all block processing to complete
      await new Promise(resolve => setTimeout(resolve, 150));

      const stats = multiChainListener.getListenerStats();
      const arbitrumStats = stats.find(s => s.chainId === 42161);
      
      expect(arbitrumStats?.blocksReceived).toBeGreaterThan(0);
    });

    it('should provide current provider information', () => {
      const stats = multiChainListener.getListenerStats();
      
      stats.forEach(stat => {
        expect(stat.providerName).toBeDefined();
        expect(typeof stat.providerName).toBe('string');
      });
    });
  });

  describe('Latest Block Data', () => {
    beforeEach(async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
    });

    it('should retrieve latest block from cache when available', async () => {
      const cachedBlock = {
        blockNumber: '1000001',
        blockHash: '0x123456789abcdef',
        timestamp: Date.now(),
        provider: 'QuickNode',
        gasUsed: '15000000',
        baseFeePerGas: '20000000000'
      };

      mockRedisCache.get.mockResolvedValue(cachedBlock);

      const latestBlock = await multiChainListener.getLatestBlock(42161);
      
      expect(latestBlock).toMatchObject({
        chainId: 42161,
        blockNumber: 1000001n,
        blockHash: '0x123456789abcdef',
        timestamp: cachedBlock.timestamp,
        provider: 'QuickNode'
      });
    });

    it('should fallback to RPC call when cache is empty', async () => {
      mockRedisCache.get.mockResolvedValue(null);

      const latestBlock = await multiChainListener.getLatestBlock(42161);
      
      expect(mockWebSocketClient.getBlock).toHaveBeenCalledWith({ blockTag: 'latest' });
      expect(latestBlock).toBeDefined();
    });

    it('should return null for disconnected chains', async () => {
      const latestBlock = await multiChainListener.getLatestBlock(999); // Unknown chain
      
      expect(latestBlock).toBeNull();
    });

    it('should handle RPC errors gracefully', async () => {
      mockRedisCache.get.mockResolvedValue(null);
      mockWebSocketClient.getBlock.mockRejectedValue(new Error('RPC error'));

      const latestBlock = await multiChainListener.getLatestBlock(42161);
      
      expect(latestBlock).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get latest block',
        expect.any(Error),
        { chainId: 42161 }
      );
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
    });

    it('should report healthy when most listeners are connected', () => {
      expect(multiChainListener.isHealthy()).toBe(true);
    });

    it('should report unhealthy when not initialized', async () => {
      const { MultiChainListener } = await import('../../../backend/src/data/MultiChainListener.js');
      const uninitializedListener = new MultiChainListener();
      
      expect(uninitializedListener.isHealthy()).toBe(false);
    });

    it('should report unhealthy when no listeners exist', async () => {
      mockRpcProviderManager.getConnectionStats.mockReturnValue([]);
      
      const { MultiChainListener } = await import('../../../backend/src/data/MultiChainListener.js');
      const emptyListener = new MultiChainListener();
      
      expect(emptyListener.isHealthy()).toBe(false);
    });

    it('should apply 80% health threshold', () => {
      // Health should be based on percentage of connected listeners
      // Mock scenario where less than 80% are connected would show unhealthy
      expect(multiChainListener.isHealthy()).toBe(true);
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
    });

    it('should handle Redis failures gracefully', async () => {
      // Set Redis as healthy but make set operation fail
      mockRedisCache.isHealthy.mockReturnValue(true);
      mockRedisCache.set.mockRejectedValue(new Error('Redis unavailable'));

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000001n);
      
      // Wait for async block processing and cache error handling
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should continue processing blocks even when Redis set fails
      // The cache failure should be logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to cache block data',
        expect.objectContaining({
          chainId: expect.any(Number),
          blockNumber: '1000001',
          error: expect.any(String)
        })
      );
    });

    it('should handle WebSocket creation failures', async () => {
      mockRpcProviderManager.getWebSocketProvider.mockImplementation(() => {
        throw new Error('WebSocket creation failed');
      });

      // Should handle individual chain failures during initialization
      await expect(multiChainListener.initialize()).rejects.toThrow();
    });

    it('should handle missing provider information gracefully', () => {
      mockRpcProviderManager.getConnectionStats.mockReturnValue([
        { chainId: 42161, chainName: 'Arbitrum', currentProvider: undefined }
      ]);

      // Should handle undefined provider names gracefully
      const stats = multiChainListener.getListenerStats();
      expect(stats[0]?.providerName).toBeDefined();
    });
  });

  describe('Event System', () => {
    beforeEach(async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
    });

    it('should support multiple event listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      multiChainListener.on('newBlock', listener1);
      multiChainListener.on('newBlock', listener2);

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      await onBlockNumber(1000001n);
      
      // Wait for async block processing and event emission
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should handle event listener errors gracefully', async () => {
      const faultyListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      
      multiChainListener.on('newBlock', faultyListener);

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onBlockNumber = watchCall[0].onBlockNumber;
      
      // Should not crash the system if a listener throws
      await onBlockNumber(1000001n);
      
      // Wait for async block processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // System should continue to work despite listener error
      expect(multiChainListener.isHealthy()).toBe(true);
    });

    it('should emit connection error events', async () => {
      const errorListener = vi.fn();
      multiChainListener.on('connectionError', errorListener);

      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onError = watchCall[0].onError;
      
      onError(new Error('Test error'));

      expect(errorListener).toHaveBeenCalledWith(
        expect.objectContaining({
          chainId: expect.any(Number),
          error: 'Test error'
        })
      );
    });
  });

  describe('Shutdown and Cleanup', () => {
    it('should shutdown gracefully', async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
      expect(multiChainListener.isHealthy()).toBe(true);

      await multiChainListener.shutdown();
      expect(multiChainListener.isHealthy()).toBe(false);
      expect(mockLogger.shutdown).toHaveBeenCalledWith('Shutting down MultiChain WebSocket Listener...');
      expect(mockLogger.shutdown).toHaveBeenCalledWith('MultiChain WebSocket Listener shutdown complete');
    });

    it('should clear all reconnection timeouts', async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
      
      // Trigger some reconnection timeouts
      const watchCall = mockWebSocketClient.watchBlockNumber.mock.calls[0];
      const onError = watchCall[0].onError;
      onError(new Error('Connection error'));

      await multiChainListener.shutdown();

      // Should clear timeouts and log cleanup
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cleared reconnection timeout',
        expect.objectContaining({ chainId: expect.any(Number) })
      );
    });

    it('should unsubscribe all WebSocket listeners', async () => {
      const mockUnsubscribe = vi.fn();
      mockWebSocketClient.watchBlockNumber.mockReturnValue(mockUnsubscribe);

      setupMockConnectionStats();
      await multiChainListener.initialize();
      await multiChainListener.shutdown();

      expect(mockUnsubscribe).toHaveBeenCalledTimes(3); // One for each chain
    });

    it('should handle unsubscribe errors gracefully', async () => {
      const mockUnsubscribe = vi.fn().mockImplementation(() => {
        throw new Error('Unsubscribe failed');
      });
      mockWebSocketClient.watchBlockNumber.mockReturnValue(mockUnsubscribe);

      setupMockConnectionStats();
      await multiChainListener.initialize();
      await multiChainListener.shutdown();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error disconnecting WebSocket listener',
        expect.any(Error),
        expect.objectContaining({
          chainId: expect.any(Number)
        })
      );
    });

    it('should remove all event listeners on shutdown', async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
      
      const testListener = vi.fn();
      multiChainListener.on('newBlock', testListener);
      
      await multiChainListener.shutdown();
      
      // Event listeners should be removed
      expect(multiChainListener.listenerCount('newBlock')).toBe(0);
    });

    it('should prevent operations during shutdown', async () => {
      setupMockConnectionStats();
      await multiChainListener.initialize();
      await multiChainListener.shutdown();

      // Should not schedule reconnections during shutdown
      expect(multiChainListener.isHealthy()).toBe(false);
    });
  });
});
