import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RpcProviderManager } from '../../../backend/src/data/RpcProviderManager.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '/Users/anthony/Desktop/BOT/.env' });

describe('RpcProviderManager Integration Tests', () => {
  let rpcProviderManager: RpcProviderManager;

  beforeAll(async () => {
    // Create a new instance for integration testing
    rpcProviderManager = new RpcProviderManager();
    
    // Initialize with real configuration
    await rpcProviderManager.initialize();
  }, 60000); // 60 second timeout for initialization

  afterAll(async () => {
    if (rpcProviderManager) {
      await rpcProviderManager.shutdown();
    }
  });

  it('should initialize with real environment configuration', () => {
    expect(rpcProviderManager.isHealthy()).toBe(true);
  });

  it('should have providers for all three chains', () => {
    // Test Arbitrum (42161)
    const arbitrumProvider = rpcProviderManager.getHttpProvider(42161);
    expect(arbitrumProvider).toBeDefined();

    // Test Polygon (137)
    const polygonProvider = rpcProviderManager.getHttpProvider(137);
    expect(polygonProvider).toBeDefined();

    // Test Base (8453)
    const baseProvider = rpcProviderManager.getHttpProvider(8453);
    expect(baseProvider).toBeDefined();
  });

  it('should get valid connection statistics', () => {
    const stats = rpcProviderManager.getConnectionStats();
    
    expect(stats).toHaveLength(3);
    
    // Check each chain
    const arbitrumStats = stats.find(s => s.chainId === 42161);
    const polygonStats = stats.find(s => s.chainId === 137);
    const baseStats = stats.find(s => s.chainId === 8453);
    
    expect(arbitrumStats).toBeDefined();
    expect(arbitrumStats?.chainName).toBe('Arbitrum One');
    expect(arbitrumStats?.totalProviders).toBe(3); // QuickNode + Alchemy + Infura
    expect(arbitrumStats?.currentProvider).toBe('QuickNode');
    
    expect(polygonStats).toBeDefined();
    expect(polygonStats?.chainName).toBe('Polygon');
    expect(polygonStats?.totalProviders).toBe(3);
    expect(polygonStats?.currentProvider).toBe('QuickNode');
    
    expect(baseStats).toBeDefined();
    expect(baseStats?.chainName).toBe('Base');
    expect(baseStats?.totalProviders).toBe(3);
    expect(baseStats?.currentProvider).toBe('QuickNode');
  });

  it('should get provider statistics for each chain', () => {
    // Test Arbitrum provider stats
    const arbitrumStats = rpcProviderManager.getProviderStats(42161);
    expect(arbitrumStats).toHaveLength(3);
    
    const quickNode = arbitrumStats.find(p => p.name === 'QuickNode');
    const alchemy = arbitrumStats.find(p => p.name === 'Alchemy');
    const infura = arbitrumStats.find(p => p.name === 'Infura');
    
    expect(quickNode?.priority).toBe(1);
    expect(alchemy?.priority).toBe(2);
    expect(infura?.priority).toBe(3);
  });

  it('should successfully make blockchain calls', async () => {
    // Test actual blockchain connectivity
    const arbitrumProvider = rpcProviderManager.getHttpProvider(42161);
    const blockNumber = await arbitrumProvider.getBlockNumber();
    
    expect(blockNumber).toBeGreaterThan(0n);
    expect(typeof blockNumber).toBe('bigint');
  });

  it('should handle provider switching', async () => {
    const initialStats = rpcProviderManager.getConnectionStats();
    const arbitrumInitial = initialStats.find(s => s.chainId === 42161);
    
    expect(arbitrumInitial?.currentProvider).toBe('QuickNode');
    
    // Force a provider switch
    const switchResult = await rpcProviderManager.switchProvider(42161, 'integration_test');
    expect(switchResult).toBe(true);
    
    const newStats = rpcProviderManager.getConnectionStats();
    const arbitrumNew = newStats.find(s => s.chainId === 42161);
    
    // Should have switched to Alchemy (next priority)
    expect(arbitrumNew?.currentProvider).toBe('Alchemy');
  });

  it('should maintain health across all providers', () => {
    const allStats = rpcProviderManager.getConnectionStats();
    
    for (const chainStats of allStats) {
      expect(chainStats.healthyProviders).toBeGreaterThan(0);
      expect(chainStats.totalProviders).toBe(3);
      expect(chainStats.currentProvider).toBeTruthy();
    }
  });

  it('should handle WebSocket providers', () => {
    // Test WebSocket connectivity
    const arbitrumWS = rpcProviderManager.getWebSocketProvider(42161);
    const polygonWS = rpcProviderManager.getWebSocketProvider(137);
    const baseWS = rpcProviderManager.getWebSocketProvider(8453);
    
    expect(arbitrumWS).toBeDefined();
    expect(polygonWS).toBeDefined();
    expect(baseWS).toBeDefined();
  });

  it('should handle wallet clients', () => {
    // Test wallet client functionality
    const arbitrumWallet = rpcProviderManager.getWalletClient(42161);
    const polygonWallet = rpcProviderManager.getWalletClient(137);
    const baseWallet = rpcProviderManager.getWalletClient(8453);
    
    expect(arbitrumWallet).toBeDefined();
    expect(arbitrumWallet.account).toBeDefined();
    expect(polygonWallet).toBeDefined();
    expect(polygonWallet.account).toBeDefined();
    expect(baseWallet).toBeDefined();
    expect(baseWallet.account).toBeDefined();
  });
});
