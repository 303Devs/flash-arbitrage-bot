import Redis from 'ioredis';
import { logger } from '../utils/Logger.js';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  database?: number; // Redis database number
}

export interface RedisConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  connectTimeout: number;
  commandTimeout: number;
  keepAlive: number;
  maxRetries: number;
  retryDelay: number;
  databases: {
    price: number;
    opportunity: number;
    processed: number;
    general: number;
  };
  ttl: {
    price: number;
    opportunity: number;
    processed: number;
  };
}

export interface PriceData {
  dex: string;
  token0: string;
  token1: string;
  price: number;
  timestamp: number;
  chain: string;
}

export interface OpportunityData {
  id: string;
  profit: number;
  gasEstimate: number;
  timestamp: number;
  chain: string;
  dexPaths: string[];
}

export class RedisCache {
  private redis: Redis;
  private isConnected: boolean = false;
  private config: RedisConfig;

  constructor() {
    this.config = this.loadConfig();
    this.redis = new Redis({
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password: this.config.password,
      // Connection settings from config
      maxRetriesPerRequest: this.config.maxRetries,
      enableReadyCheck: true,
      lazyConnect: true,
      keepAlive: this.config.keepAlive,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
      // Reconnection logic
      reconnectOnError: (err) => {
        logger.warn('Redis reconnecting due to error', { error: err.message });
        return err.message.includes('READONLY') || err.message.includes('ECONNRESET');
      },
      // Better error handling
      enableOfflineQueue: false,
    });

    this.setupEventHandlers();
  }

  private loadConfig(): RedisConfig {
    // Validate required environment variables
    if (!process.env.REDIS_PASSWORD) {
      throw new Error('REDIS_PASSWORD environment variable is required');
    }

    // Parse and validate numeric values
    const port = parseInt(process.env.REDIS_PORT || '6379');
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('REDIS_PORT must be a valid port number (1-65535)');
    }

    const connectTimeout = parseInt(process.env.REDIS_CONNECT_TIMEOUT_MS || '10000');
    if (isNaN(connectTimeout) || connectTimeout < 1000) {
      throw new Error('REDIS_CONNECT_TIMEOUT_MS must be at least 1000ms');
    }

    const commandTimeout = parseInt(process.env.REDIS_COMMAND_TIMEOUT_MS || '5000');
    if (isNaN(commandTimeout) || commandTimeout < 1000) {
      throw new Error('REDIS_COMMAND_TIMEOUT_MS must be at least 1000ms');
    }

    const maxDatabases = parseInt(process.env.REDIS_DATABASES || '4');
    const priceDb = parseInt(process.env.REDIS_PRICE_DATABASE || '0');
    const opportunityDb = parseInt(process.env.REDIS_OPPORTUNITY_DATABASE || '1');
    const processedDb = parseInt(process.env.REDIS_PROCESSED_DATABASE || '2');
    const generalDb = parseInt(process.env.REDIS_GENERAL_DATABASE || '3');

    // Validate database numbers
    const databases = [priceDb, opportunityDb, processedDb, generalDb];
    for (const db of databases) {
      if (isNaN(db) || db < 0 || db >= maxDatabases) {
        throw new Error(`Database numbers must be between 0 and ${maxDatabases - 1}`);
      }
    }

    // Check for duplicate database assignments
    const uniqueDatabases = new Set(databases);
    if (uniqueDatabases.size !== databases.length) {
      throw new Error('Database assignments must be unique');
    }

    return {
      host: process.env.REDIS_HOST || 'localhost',
      port,
      username: process.env.REDIS_USERNAME || 'flash-arbitrage-bot',
      password: process.env.REDIS_PASSWORD,
      connectTimeout,
      commandTimeout,
      keepAlive: parseInt(process.env.REDIS_KEEPALIVE_MS || '30000'),
      maxRetries: Math.max(1, parseInt(process.env.REDIS_MAX_RETRIES || '3')),
      retryDelay: Math.max(50, parseInt(process.env.REDIS_RETRY_DELAY_MS || '100')),
      databases: {
        price: priceDb,
        opportunity: opportunityDb,
        processed: processedDb,
        general: generalDb,
      },
      ttl: {
        price: Math.max(5, parseInt(process.env.REDIS_PRICE_TTL || '30')),
        opportunity: Math.max(10, parseInt(process.env.REDIS_OPPORTUNITY_TTL || '60')),
        processed: Math.max(60, parseInt(process.env.REDIS_PROCESSED_TTL || '300')),
      },
    };
  }

  private setupEventHandlers(): void {
    this.redis.on('connect', () => {
      logger.info('Redis connection established');
      this.isConnected = true;
    });

    this.redis.on('ready', () => {
      logger.info('Redis ready for operations');
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.redis.connect();
      logger.info('Redis cache initialized successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw new Error(`Redis connection failed: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection', { error });
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.redis.status === 'ready';
  }

  // Price data caching
  async setPriceData(key: string, data: PriceData, options: CacheOptions = {}): Promise<void> {
    const { ttl = this.config.ttl.price, database = this.config.databases.price } = options;
    
    try {
      await this.redis.select(database);
      const serialized = JSON.stringify(data);
      await this.redis.setex(`price:${key}`, ttl, serialized);
      
      logger.debug('Price data cached', { key, ttl, database });
    } catch (error) {
      logger.error('Failed to cache price data', { key, error });
      throw error;
    }
  }

  async getPriceData(key: string, database: number = this.config.databases.price): Promise<PriceData | null> {
    try {
      await this.redis.select(database);
      const data = await this.redis.get(`price:${key}`);
      
      if (!data) {
        return null;
      }
      
      const parsed = JSON.parse(data) as PriceData;
      logger.debug('Price data retrieved from cache', { key, database });
      return parsed;
    } catch (error) {
      logger.error('Failed to retrieve price data', { key, error });
      return null;
    }
  }

  // Opportunity caching
  async setOpportunity(data: OpportunityData, options: CacheOptions = {}): Promise<void> {
    const { ttl = this.config.ttl.opportunity, database = this.config.databases.opportunity } = options;
    
    try {
      await this.redis.select(database);
      const key = `opportunity:${data.id}`;
      const serialized = JSON.stringify(data);
      await this.redis.setex(key, ttl, serialized);
      
      logger.debug('Opportunity cached', { id: data.id, ttl, database });
    } catch (error) {
      logger.error('Failed to cache opportunity', { id: data.id, error });
      throw error;
    }
  }

  async getOpportunity(id: string, database: number = this.config.databases.opportunity): Promise<OpportunityData | null> {
    try {
      await this.redis.select(database);
      const data = await this.redis.get(`opportunity:${id}`);
      
      if (!data) {
        return null;
      }
      
      const parsed = JSON.parse(data) as OpportunityData;
      logger.debug('Opportunity retrieved from cache', { id, database });
      return parsed;
    } catch (error) {
      logger.error('Failed to retrieve opportunity', { id, error });
      return null;
    }
  }

  // Duplicate prevention
  async markProcessed(opportunityId: string, ttl: number = this.config.ttl.processed): Promise<void> {
    try {
      await this.redis.select(this.config.databases.processed);
      await this.redis.setex(`processed:${opportunityId}`, ttl, '1');
      logger.debug('Opportunity marked as processed', { opportunityId, ttl });
    } catch (error) {
      logger.error('Failed to mark opportunity as processed', { opportunityId, error });
      throw error;
    }
  }

  async isProcessed(opportunityId: string): Promise<boolean> {
    try {
      await this.redis.select(this.config.databases.processed);
      const exists = await this.redis.exists(`processed:${opportunityId}`);
      return exists === 1;
    } catch (error) {
      logger.error('Failed to check if opportunity is processed', { opportunityId, error });
      return false; // Fail open - better to potentially duplicate than miss opportunity
    }
  }

  // General caching methods
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      await this.redis.select(this.config.databases.general);
      const serialized = JSON.stringify(value);
      
      if (ttl) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
      
      logger.debug('Data cached', { key, ttl });
    } catch (error) {
      logger.error('Failed to cache data', { key, error });
      throw error;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      await this.redis.select(this.config.databases.general);
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }
      
      const parsed = JSON.parse(data) as T;
      logger.debug('Data retrieved from cache', { key });
      return parsed;
    } catch (error) {
      logger.error('Failed to retrieve data', { key, error });
      return null;
    }
  }

  async delete(key: string, database: number = this.config.databases.general): Promise<boolean> {
    try {
      await this.redis.select(database);
      const result = await this.redis.del(key);
      logger.debug('Data deleted from cache', { key, database, deleted: result > 0 });
      return result > 0;
    } catch (error) {
      logger.error('Failed to delete data', { key, error });
      return false;
    }
  }

  // Utility methods
  async flushDatabase(database: number): Promise<void> {
    try {
      await this.redis.select(database);
      await this.redis.flushdb();
      logger.info('Database flushed', { database });
    } catch (error) {
      logger.error('Failed to flush database', { database, error });
      throw error;
    }
  }

  async getStats(): Promise<{
    totalKeys: number;
    memoryUsage: string;
    uptime: number;
    connectedClients: number;
  }> {
    try {
      const info = await this.redis.info();
      const keyspace = await this.redis.info('keyspace');
      
      // Parse info string for useful metrics
      const memoryMatch = info.match(/used_memory_human:(\S+)/);
      const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
      const clientsMatch = info.match(/connected_clients:(\d+)/);
      
      // Count total keys across all databases
      const keyspaceLines = keyspace.split('\n').filter(line => line.startsWith('db'));
      let totalKeys = 0;
      keyspaceLines.forEach(line => {
        const match = line.match(/keys=(\d+)/);
        if (match) {
          const matchedValue = match[1];
          if (matchedValue) {
            totalKeys += parseInt(matchedValue);
          }
        }
      });
      
      return {
        totalKeys,
        memoryUsage: memoryMatch?.[1] || 'unknown',
        uptime: uptimeMatch?.[1] ? parseInt(uptimeMatch[1]) : 0,
        connectedClients: clientsMatch?.[1] ? parseInt(clientsMatch[1]) : 0,
      };
    } catch (error) {
      logger.error('Failed to get Redis stats', { error });
      throw error;
    }
  }

  // Health check method for monitoring
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis ping failed', { error });
      return false;
    }
  }

  // ================================
  // PHASE 2 ENHANCEMENTS - Health Monitoring Support
  // ================================

  /**
   * Cache provider health metrics with structured keys
   */
  async setProviderHealthMetrics(chainId: number, providerName: string, metrics: {
    isHealthy: boolean;
    consecutiveFailures: number;
    responseTime: number;
    successRate: number;
    healthScore: number;
    degradationTrend: string;
    timestamp: number;
  }): Promise<void> {
    try {
      await this.redis.select(this.config.databases.general);
      const key = `provider_health:${chainId}:${providerName}`;
      const serialized = JSON.stringify(metrics);
      await this.redis.setex(key, 600, serialized); // 10 minute TTL
      
      logger.debug('Provider health metrics cached', { 
        chainId, 
        providerName, 
        healthScore: metrics.healthScore,
        isHealthy: metrics.isHealthy
      });
    } catch (error) {
      logger.error('Failed to cache provider health metrics', { 
        chainId, 
        providerName, 
        error 
      });
      throw error;
    }
  }

  /**
   * Get cached provider health metrics
   */
  async getProviderHealthMetrics(chainId: number, providerName: string): Promise<any | null> {
    try {
      await this.redis.select(this.config.databases.general);
      const key = `provider_health:${chainId}:${providerName}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        return null;
      }
      
      const parsed = JSON.parse(data);
      logger.debug('Provider health metrics retrieved', { 
        chainId, 
        providerName,
        healthScore: parsed.healthScore
      });
      return parsed;
    } catch (error) {
      logger.error('Failed to retrieve provider health metrics', { 
        chainId, 
        providerName, 
        error 
      });
      return null;
    }
  }

  /**
   * Cache circuit breaker state
   */
  async setCircuitBreakerState(chainId: number, providerName: string, state: {
    state: 'closed' | 'half_open' | 'open';
    failureCount: number;
    openedAt: number;
    nextRetryTime: number;
  }): Promise<void> {
    try {
      await this.redis.select(this.config.databases.general);
      const key = `circuit_breaker:${chainId}:${providerName}`;
      const serialized = JSON.stringify(state);
      await this.redis.setex(key, 1800, serialized); // 30 minute TTL
      
      logger.debug('Circuit breaker state cached', { 
        chainId, 
        providerName, 
        state: state.state,
        failureCount: state.failureCount
      });
    } catch (error) {
      logger.error('Failed to cache circuit breaker state', { 
        chainId, 
        providerName, 
        error 
      });
      throw error;
    }
  }

  /**
   * Increment request counter for a provider
   */
  async incrementProviderRequestCount(chainId: number, providerName: string, success: boolean): Promise<void> {
    try {
      await this.redis.select(this.config.databases.general);
      const totalKey = `provider_requests:${chainId}:${providerName}:total`;
      const successKey = `provider_requests:${chainId}:${providerName}:success`;
      
      // Increment counters with expiration
      await this.redis.incr(totalKey);
      await this.redis.expire(totalKey, 3600); // 1 hour
      
      if (success) {
        await this.redis.incr(successKey);
        await this.redis.expire(successKey, 3600); // 1 hour
      }
      
    } catch (error) {
      logger.error('Failed to increment provider request count', { 
        chainId, 
        providerName, 
        success, 
        error 
      });
      // Don't throw - request counting is not critical
    }
  }

  /**
   * Get provider request statistics
   */
  async getProviderRequestStats(chainId: number, providerName: string): Promise<{
    totalRequests: number;
    successfulRequests: number;
    successRate: number;
  }> {
    try {
      await this.redis.select(this.config.databases.general);
      const totalKey = `provider_requests:${chainId}:${providerName}:total`;
      const successKey = `provider_requests:${chainId}:${providerName}:success`;
      
      const [totalStr, successStr] = await Promise.all([
        this.redis.get(totalKey),
        this.redis.get(successKey)
      ]);
      
      const totalRequests = totalStr ? parseInt(totalStr) : 0;
      const successfulRequests = successStr ? parseInt(successStr) : 0;
      const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
      
      return {
        totalRequests,
        successfulRequests,
        successRate
      };
    } catch (error) {
      logger.error('Failed to get provider request stats', { 
        chainId, 
        providerName, 
        error 
      });
      return {
        totalRequests: 0,
        successfulRequests: 0,
        successRate: 0
      };
    }
  }
}

// Export singleton instance
export const redisCache = new RedisCache();
