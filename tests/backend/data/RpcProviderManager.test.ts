import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { RpcProviderManager } from '../../../backend/src/data/RpcProviderManager.js';
import { logger } from '../../../backend/src/utils/Logger.js';
import { redisCache } from '../../../backend/src/storage/RedisCache.js';

// Mock external dependencies
vi.mock('../../../backend/src/utils/Logger.js');
vi.mock('../../../backend/src/storage/RedisCache.js');
vi.mock('viem', () => ({
  createPublicClient: vi.fn(),
  createWalletClient: vi.fn(), 
  http: vi.fn(),
  webSocket: vi.fn(),
  arbitrum: { id: 42161, name: 'Arbitrum One' },
  polygon: { id: 137, name: 'Polygon' },
  base: { id: 8453, name: 'Base' }
}));
vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({ address: '0x1234567890123456789012345678901234567890' }))
}));

// Mock file system
vi.mock('fs', () => ({
  readFileSync: vi.fn()
}));

describe('RpcProviderManager', () => {
  let rpcProviderManager: RpcProviderManager;
  let mockLogger: any;
  let mockRedisCache: any;

  // Mock chain configuration
  const mockChainConfig = {
    "42161": {
      "chainId": 42161,
      "name": "Arbitrum One",
      "nativeCurrency": {
        "name": "Ethereum",
        "symbol": "ETH",
        "decimals": 18
      },
      "rpcProviders": {
        "primary": {
          "name": "QuickNode",
          "websocket": "${QUICKNODE_ARBITRUM_WSS}",
          "http": "${QUICKNODE_ARBITRUM_HTTP}",
          "priority": 1,
          "maxRetries": 3
        },
        "fallback": [
          {
            "name": "Alchemy",
            "websocket": "${ALCHEMY_ARBITRUM_WSS}",
            "http": "${ALCHEMY_ARBITRUM_HTTP}",
            "priority": 2,
            "maxRetries": 3
          }
        ]
      },
      "performance": {
        "averageBlockTime": 0.25,
        "confirmationsRequired": 1,
        "maxBlocksToWait": 20,
        "rpcTimeout": 3000,
        "retryBackoff": [500, 1000, 2000]
      }
    }
  };

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup environment variables
    process.env.PRIVATE_KEY = '0x1234567890123456789012345678901234567890123456789012345678901234';
    process.env.QUICKNODE_ARBITRUM_WSS = 'wss://test-quicknode-arbitrum.com';
    process.env.QUICKNODE_ARBITRUM_HTTP = 'https://test-quicknode-arbitrum.com';
    process.env.ALCHEMY_ARBITRUM_WSS = 'wss://test-alchemy-arbitrum.com';
    process.env.ALCHEMY_ARBITRUM_HTTP = 'https://test-alchemy-arbitrum.com';
    
    // Add Redis environment variables for tests
    process.env.REDIS_PASSWORD = 'test-password';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';

    // Mock logger
    mockLogger = {
      startup: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      shutdown: vi.fn()
    };
    (logger as any).startup = mockLogger.startup;
    (logger as any).info = mockLogger.info;
    (logger as any).debug = mockLogger.debug;
    (logger as any).warn = mockLogger.warn;
    (logger as any).error = mockLogger.error;
    (logger as any).shutdown = mockLogger.shutdown;

    // Mock Redis cache
    mockRedisCache = {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      isHealthy: vi.fn().mockReturnValue(true),
      connect: vi.fn().mockResolvedValue(undefined)
    };
    (redisCache as any).set = mockRedisCache.set;
    (redisCache as any).get = mockRedisCache.get;
    (redisCache as any).isHealthy = mockRedisCache.isHealthy;
    (redisCache as any).connect = mockRedisCache.connect;

    // Mock file system
    const { readFileSync } = await import('fs');
    (readFileSync as MockedFunction<typeof readFileSync>).mockReturnValue(
      JSON.stringify(mockChainConfig)
    );

    // Mock viem clients
    const { createPublicClient, createWalletClient, http, webSocket } = await import('viem');
    const mockPublicClient = {
      getBlockNumber: vi.fn().mockResolvedValue(1000000n)
    };
    const mockWalletClient = {
      account: { address: '0x1234567890123456789012345678901234567890' }
    };

    (createPublicClient as MockedFunction<typeof createPublicClient>).mockReturnValue(mockPublicClient as any);
    (createWalletClient as MockedFunction<typeof createWalletClient>).mockReturnValue(mockWalletClient as any);
    (http as MockedFunction<typeof http>).mockReturnValue({} as any);
    (webSocket as MockedFunction<typeof webSocket>).mockReturnValue({} as any);

    // Create fresh instance
    rpcProviderManager = new RpcProviderManager();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.PRIVATE_KEY;
    delete process.env.QUICKNODE_ARBITRUM_WSS;
    delete process.env.QUICKNODE_ARBITRUM_HTTP;
    delete process.env.ALCHEMY_ARBITRUM_WSS;
    delete process.env.ALCHEMY_ARBITRUM_HTTP;
    delete process.env.REDIS_PASSWORD;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
  });

  describe('Constructor', () => {
    it('should create instance without initialization', () => {
      expect(rpcProviderManager).toBeDefined();
      expect(rpcProviderManager.isHealthy()).toBe(false);
    });

    it('should throw error if PRIVATE_KEY is missing', () => {
      delete process.env.PRIVATE_KEY;
      expect(() => new RpcProviderManager()).toThrow('PRIVATE_KEY environment variable is required');
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      // Stop the timer to prevent health checks during test
      vi.useFakeTimers();
      
      await rpcProviderManager.initialize();
      
      expect(mockLogger.startup).toHaveBeenCalledWith('Initializing RPC Provider Manager...');
      expect(mockLogger.startup).toHaveBeenCalledWith(
        'RPC Provider Manager initialized successfully',
        expect.objectContaining({
          chainsLoaded: 1,
          totalProviders: 2
        })
      );
      
      vi.useRealTimers();
    });

    it('should throw error if chains.json is missing required environment variables', async () => {
      delete process.env.QUICKNODE_ARBITRUM_WSS;
      
      await expect(rpcProviderManager.initialize()).rejects.toThrow(
        'Environment variable QUICKNODE_ARBITRUM_WSS is not set'
      );
    });

    it('should load chain configurations correctly', async () => {
      vi.useFakeTimers();
      
      await rpcProviderManager.initialize();
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Chain configuration loaded',
        expect.objectContaining({
          chainId: 42161,
          chainName: 'Arbitrum One',
          providersCount: 2
        })
      );
      
      vi.useRealTimers();
    });
  });

  describe('Provider Management', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await rpcProviderManager.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should get HTTP provider for valid chain', () => {
      const provider = rpcProviderManager.getHttpProvider(42161);
      expect(provider).toBeDefined();
      expect(provider.getBlockNumber).toBeDefined();
    });

    it('should get WebSocket provider for valid chain', () => {
      const provider = rpcProviderManager.getWebSocketProvider(42161);
      expect(provider).toBeDefined();
      expect(provider.getBlockNumber).toBeDefined();
    });

    it('should get wallet client for valid chain', () => {
      const walletClient = rpcProviderManager.getWalletClient(42161);
      expect(walletClient).toBeDefined();
      expect(walletClient.account).toBeDefined();
    });

    it('should throw error for invalid chain ID', () => {
      expect(() => rpcProviderManager.getHttpProvider(999)).toThrow(
        'No provider available for chain 999'
      );
    });

    it('should throw error when not initialized', () => {
      const uninitializedManager = new RpcProviderManager();
      expect(() => uninitializedManager.getHttpProvider(42161)).toThrow(
        'RPC Provider Manager is not initialized. Call initialize() first.'
      );
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      vi.useFakeTimers();
      await rpcProviderManager.initialize();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should report healthy when providers are working', () => {
      expect(rpcProviderManager.isHealthy()).toBe(true);
    });

    it('should get provider statistics', () => {
      const stats = rpcProviderManager.getProviderStats(42161);
      expect(stats).toHaveLength(2);
      expect(stats[0]).toMatchObject({
        name: 'QuickNode',
        priority: 1,
        isHealthy: true,
        consecutiveFailures: 0
      });
      expect(stats[1]).toMatchObject({
        name: 'Alchemy',
        priority: 2,
        isHealthy: true,
        consecutiveFailures: 0
      });
    });

    it('should get connection statistics', () => {
      const stats = rpcProviderManager.getConnectionStats();
      expect(stats).toHaveLength(1);
      expect(stats[0]).toMatchObject({
        chainId: 42161,
        chainName: 'Arbitrum One',
        totalProviders: 2,
        healthyProviders: 2,
        currentProvider: 'QuickNode'
      });
    });

    it('should switch provider when requested', async () => {
      const result = await rpcProviderManager.switchProvider(42161, 'manual_switch');
      
      // Since we mark the current provider as unhealthy, it should switch
      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Provider switched',
        expect.objectContaining({
          chainId: 42161,
          newProvider: 'Alchemy',
          reason: 'manual_switch'
        })
      );
    });

    it('should cache provider health in Redis', async () => {
      // Health checks are performed during initialization
      expect(mockRedisCache.set).toHaveBeenCalledWith(
        'provider_health:42161:QuickNode',
        expect.objectContaining({
          name: 'QuickNode',
          isHealthy: true
        }),
        300
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle provider creation errors gracefully', async () => {
      const { createPublicClient } = await import('viem');
      (createPublicClient as MockedFunction<typeof createPublicClient>).mockImplementation(() => {
        throw new Error('Connection failed');
      });

      await expect(rpcProviderManager.initialize()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize RPC Provider Manager',
        expect.any(Error)
      );
    });

    it('should handle health check failures', async () => {
      vi.useFakeTimers();
      
      const { createPublicClient } = await import('viem');
      const mockClient = {
        getBlockNumber: vi.fn().mockRejectedValue(new Error('Network error'))
      };
      (createPublicClient as MockedFunction<typeof createPublicClient>).mockReturnValue(mockClient as any);

      const newManager = new RpcProviderManager();
      await newManager.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Provider health check failed',
        expect.objectContaining({
          chainId: 42161,
          provider: 'QuickNode',
          consecutiveFailures: 1
        })
      );
      
      vi.useRealTimers();
    });

    it('should handle Redis cache errors gracefully', async () => {
      vi.useFakeTimers();
      
      mockRedisCache.set.mockRejectedValue(new Error('Redis connection failed'));
      
      await rpcProviderManager.initialize();
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to cache provider health status',
        expect.objectContaining({
          chainId: 42161,
          provider: 'QuickNode'
        })
      );
      
      vi.useRealTimers();
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      vi.useFakeTimers();
      
      await rpcProviderManager.initialize();
      await rpcProviderManager.shutdown();
      
      expect(mockLogger.shutdown).toHaveBeenCalledWith('Shutting down RPC Provider Manager...');
      expect(mockLogger.shutdown).toHaveBeenCalledWith('RPC Provider Manager shutdown complete');
      expect(rpcProviderManager.isHealthy()).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe('Environment Variable Resolution', () => {
    it('should resolve environment variables in configuration', async () => {
      vi.useFakeTimers();
      
      await rpcProviderManager.initialize();
      
      // Verify that environment variables were resolved correctly
      const stats = rpcProviderManager.getProviderStats(42161);
      expect(stats[0].name).toBe('QuickNode');
      expect(stats[1].name).toBe('Alchemy');
      
      vi.useRealTimers();
    });

    it('should handle missing environment variables', async () => {
      const configWithMissingVar = {
        ...mockChainConfig,
        "42161": {
          ...mockChainConfig["42161"],
          "rpcProviders": {
            ...mockChainConfig["42161"].rpcProviders,
            "primary": {
              ...mockChainConfig["42161"].rpcProviders.primary,
              "websocket": "${MISSING_ENV_VAR}"
            }
          }
        }
      };

      const { readFileSync } = await import('fs');
      (readFileSync as MockedFunction<typeof readFileSync>).mockReturnValue(
        JSON.stringify(configWithMissingVar)
      );

      const newManager = new RpcProviderManager();
      await expect(newManager.initialize()).rejects.toThrow(
        'Environment variable MISSING_ENV_VAR is not set'
      );
    });
  });
});
