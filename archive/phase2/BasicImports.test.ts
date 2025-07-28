import { describe, it, expect } from 'vitest';

describe('Basic Phase 2 Import Test', () => {
  it('should import Logger successfully', async () => {
    const { logger } = await import('../../../backend/src/utils/Logger.js');
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
  });

  it('should import RPC Provider Manager successfully', async () => {
    const { rpcProviderManager } = await import('../../../backend/src/data/RpcProviderManager.js');
    expect(rpcProviderManager).toBeDefined();
    expect(typeof rpcProviderManager.initialize).toBe('function');
  });

  it('should import MultiChain Listener successfully', async () => {
    const { multiChainListener } = await import('../../../backend/src/data/MultiChainListener.js');
    expect(multiChainListener).toBeDefined();
    expect(typeof multiChainListener.initialize).toBe('function');
  });

  it('should import Connection Health Monitor successfully', async () => {
    const { connectionHealthMonitor } = await import('../../../backend/src/data/ConnectionHealthMonitor.js');
    expect(connectionHealthMonitor).toBeDefined();
    expect(typeof connectionHealthMonitor.initialize).toBe('function');
  });

  it('should import Provider Failover Logic successfully', async () => {
    const { providerFailoverLogic } = await import('../../../backend/src/data/ProviderFailoverLogic.js');
    expect(providerFailoverLogic).toBeDefined();
    expect(typeof providerFailoverLogic.initialize).toBe('function');
  });

  it('should import storage components successfully', async () => {
    const { redisCache } = await import('../../../backend/src/storage/RedisCache.js');
    const { postgresRepository } = await import('../../../backend/src/storage/PostgresRepository.js');
    
    expect(redisCache).toBeDefined();
    expect(postgresRepository).toBeDefined();
    expect(typeof postgresRepository.createHealthMonitoringTables).toBe('function');
  });
});
