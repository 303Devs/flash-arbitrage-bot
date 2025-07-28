/**
 * 🗄️ Test Database Infrastructure
 *
 * Enterprise-grade test database setup with real Redis and PostgreSQL instances.
 * Provides isolated test environments with comprehensive cleanup procedures.
 *
 * @fileoverview Test database management for MEV arbitrage bot testing
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import Redis from 'ioredis';
import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from '@utils/Logger';

/**
 * Redis test instance configuration
 */
export interface RedisTestConfig {
  host: string;
  port: number;
  password?: string;
  database: number;
  connectTimeout: number;
  commandTimeout: number;
}

/**
 * PostgreSQL test instance configuration
 */
export interface PostgresTestConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

/**
 * Test database instance container
 */
export interface TestDatabaseInstance {
  redis: Redis;
  postgres: Pool;
  cleanup: () => Promise<void>;
  testId: string;
}

/**
 * Test database metrics for performance monitoring
 */
export interface TestDatabaseMetrics {
  setupTimeMs: number;
  cleanupTimeMs: number;
  redisConnectionTime: number;
  postgresConnectionTime: number;
  testId: string;
  timestamp: Date;
}

/**
 * Enterprise Test Database Infrastructure
 *
 * Provides isolated test database instances for comprehensive testing.
 * Uses real Redis and PostgreSQL with proper isolation and cleanup.
 */
export class TestDatabases {
  private static readonly logger = logger;
  private static activeInstances = new Map<string, TestDatabaseInstance>();
  private static instanceCounter = 0;

  /**
   * Redis test database numbers (isolated from production databases 0-3)
   */
  private static readonly REDIS_TEST_DATABASES = {
    MAIN_TEST: 14,
    INTEGRATION_TEST: 15,
  };

  /**
   * PostgreSQL test schema prefix
   */
  private static readonly POSTGRES_TEST_SCHEMA_PREFIX = 'test_';

  /**
   * Create isolated test database instance
   *
   * @param testName - Name of the test for identification
   * @returns Complete test database instance with cleanup
   */
  public static async setupTestEnvironment(testName: string): Promise<TestDatabaseInstance> {
    const startTime = Date.now();
    const testId = `${testName}_${++this.instanceCounter}_${Date.now()}`;

    this.logger.info('Setting up test database environment', { testId, testName });

    try {
      // Setup Redis test instance
      const redis = await this.setupRedisTest(testId);

      // Setup PostgreSQL test instance
      const postgres = await this.setupPostgresTest(testId);

      // Create cleanup function
      const cleanup = async () => {
        await this.cleanupTestInstance(testId, redis, postgres);
      };

      const instance: TestDatabaseInstance = {
        redis,
        postgres,
        cleanup,
        testId,
      };

      // Track active instance
      this.activeInstances.set(testId, instance);

      const setupTime = Date.now() - startTime;
      this.logger.info('Test database environment ready', {
        testId,
        setupTimeMs: setupTime,
        redisDb: this.REDIS_TEST_DATABASES.MAIN_TEST,
        postgresSchema: `${this.POSTGRES_TEST_SCHEMA_PREFIX}${testId.toLowerCase()}`,
      });

      return instance;
    } catch (error) {
      this.logger.error('Failed to setup test database environment', { testId, error });
      throw new Error(
        `Test database setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Setup isolated Redis test instance
   *
   * @param testId - Test instance identifier
   * @returns Redis instance configured for testing
   */
  public static async setupRedisTest(testId: string): Promise<Redis> {
    const redisConfig: RedisTestConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      database: this.REDIS_TEST_DATABASES.MAIN_TEST,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };

    this.logger.debug('Creating Redis test instance', { testId, config: redisConfig });

    const redis = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.database,
      connectTimeout: redisConfig.connectTimeout,
      commandTimeout: redisConfig.commandTimeout,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });

    // Wait for connection
    await redis.ping();

    // Clear test database
    await redis.flushdb();

    this.logger.debug('Redis test instance ready', {
      testId,
      database: redisConfig.database,
      host: redisConfig.host,
      port: redisConfig.port,
    });

    return redis;
  }

  /**
   * Setup isolated PostgreSQL test instance
   *
   * @param testId - Test instance identifier
   * @returns PostgreSQL pool configured for testing
   */
  public static async setupPostgresTest(testId: string): Promise<Pool> {
    const postgresConfig: PostgresTestConfig = {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_APP_DB || 'flash_arbitrage_bot',
      user: process.env.POSTGRES_APP_USER || 'flash_arbitrage_user',
      password: process.env.POSTGRES_APP_PASSWORD || 'flash_arbitrage_dev',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };

    this.logger.debug('Creating PostgreSQL test instance', { testId, config: postgresConfig });

    const poolConfig: PoolConfig = {
      host: postgresConfig.host,
      port: postgresConfig.port,
      database: postgresConfig.database,
      user: postgresConfig.user,
      password: postgresConfig.password,
      max: postgresConfig.max,
      idleTimeoutMillis: postgresConfig.idleTimeoutMillis,
      connectionTimeoutMillis: postgresConfig.connectionTimeoutMillis,
    };

    const pool = new Pool(poolConfig);

    // Test connection
    const client = await pool.connect();

    // Create isolated test schema
    const testSchema = `${this.POSTGRES_TEST_SCHEMA_PREFIX}${testId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${testSchema}"`);
      await client.query(`SET search_path TO "${testSchema}"`);

      // Create test tables in isolated schema
      await this.createTestTables(client, testSchema);
    } finally {
      client.release();
    }

    this.logger.debug('PostgreSQL test instance ready', {
      testId,
      schema: testSchema,
      host: postgresConfig.host,
      port: postgresConfig.port,
      database: postgresConfig.database,
    });

    return pool;
  }

  /**
   * Create test tables in isolated schema
   *
   * @param client - PostgreSQL client
   * @param schema - Test schema name
   */
  private static async createTestTables(client: PoolClient, schema: string): Promise<void> {
    // Provider health events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".provider_health_events (
        id SERIAL PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        provider_name VARCHAR(50) NOT NULL,
        event_type VARCHAR(30) NOT NULL,
        health_score INTEGER,
        metrics JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Circuit breaker events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".circuit_breaker_events (
        id SERIAL PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        provider_name VARCHAR(50) NOT NULL,
        state VARCHAR(20) NOT NULL,
        failure_count INTEGER,
        last_failure_time TIMESTAMP WITH TIME ZONE,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Failover events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".failover_events (
        id SERIAL PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        from_provider VARCHAR(50) NOT NULL,
        to_provider VARCHAR(50) NOT NULL,
        reason VARCHAR(100),
        failover_time_ms INTEGER,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Performance snapshots table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".performance_snapshots (
        id SERIAL PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        provider_name VARCHAR(50) NOT NULL,
        metrics JSONB NOT NULL,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Test-specific tables for integration testing
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".test_executions (
        id SERIAL PRIMARY KEY,
        test_name VARCHAR(100) NOT NULL,
        execution_time_ms INTEGER,
        status VARCHAR(20),
        metadata JSONB,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Cleanup test database instance
   *
   * @param testId - Test instance identifier
   * @param redis - Redis instance to cleanup
   * @param postgres - PostgreSQL pool to cleanup
   */
  private static async cleanupTestInstance(
    testId: string,
    redis: Redis,
    postgres: Pool
  ): Promise<void> {
    const startTime = Date.now();

    this.logger.debug('Cleaning up test database instance', { testId });

    try {
      // Cleanup Redis
      if (redis.status === 'ready') {
        await redis.flushdb();
        await redis.disconnect();
      }

      // Cleanup PostgreSQL
      if (!postgres.ended) {
        const client = await postgres.connect();
        const testSchema = `${this.POSTGRES_TEST_SCHEMA_PREFIX}${testId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

        try {
          await client.query(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
        } finally {
          client.release();
        }

        await postgres.end();
      }

      // Remove from active instances
      this.activeInstances.delete(testId);

      const cleanupTime = Date.now() - startTime;
      this.logger.debug('Test database cleanup complete', { testId, cleanupTimeMs: cleanupTime });
    } catch (error) {
      this.logger.error('Test database cleanup failed', { testId, error });
      // Don't throw - cleanup should be best effort
    }
  }

  /**
   * Cleanup all active test instances
   * Emergency cleanup for test suite shutdown
   */
  public static async cleanupAllInstances(): Promise<void> {
    this.logger.info('Cleaning up all test database instances', {
      activeCount: this.activeInstances.size,
    });

    const cleanupPromises = Array.from(this.activeInstances.values()).map((instance) =>
      instance
        .cleanup()
        .catch((error) =>
          this.logger.error('Failed to cleanup test instance', { testId: instance.testId, error })
        )
    );

    await Promise.all(cleanupPromises);
    this.activeInstances.clear();

    this.logger.info('All test database instances cleaned up');
  }

  /**
   * Get test database metrics for performance monitoring
   *
   * @returns Current test database metrics
   */
  public static getTestMetrics(): TestDatabaseMetrics {
    return {
      setupTimeMs: 0, // Will be populated during setup
      cleanupTimeMs: 0, // Will be populated during cleanup
      redisConnectionTime: 0, // Will be populated during connection
      postgresConnectionTime: 0, // Will be populated during connection
      testId: 'metrics',
      timestamp: new Date(),
    };
  }

  /**
   * Verify test database connectivity
   *
   * @param instance - Test database instance to verify
   * @returns Connection verification status
   */
  public static async verifyConnectivity(instance: TestDatabaseInstance): Promise<boolean> {
    try {
      // Test Redis connectivity
      await instance.redis.ping();

      // Test PostgreSQL connectivity
      const client = await instance.postgres.connect();
      await client.query('SELECT 1');
      client.release();

      this.logger.debug('Test database connectivity verified', { testId: instance.testId });
      return true;
    } catch (error) {
      this.logger.error('Test database connectivity failed', {
        testId: instance.testId,
        error,
      });
      return false;
    }
  }

  /**
   * Get active test instance count for monitoring
   */
  public static getActiveInstanceCount(): number {
    return this.activeInstances.size;
  }

  /**
   * Get Redis test database configuration
   */
  public static getRedisTestConfig(): RedisTestConfig {
    return {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      database: this.REDIS_TEST_DATABASES.MAIN_TEST,
      connectTimeout: 10000,
      commandTimeout: 5000,
    };
  }

  /**
   * Get PostgreSQL test database configuration
   */
  public static getPostgresTestConfig(): PostgresTestConfig {
    return {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_APP_DB || 'flash_arbitrage_bot',
      user: process.env.POSTGRES_APP_USER || 'flash_arbitrage_user',
      password: process.env.POSTGRES_APP_PASSWORD || 'flash_arbitrage_dev',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }
}

/**
 * Test database helper for common testing operations
 */
export class TestDatabaseHelpers {
  private static readonly logger = logger;

  /**
   * Seed test data for provider health testing
   */
  public static async seedProviderHealthData(
    postgres: Pool,
    testSchema: string,
    chainId: number,
    providerName: string
  ): Promise<void> {
    const client = await postgres.connect();

    try {
      await client.query(`SET search_path TO "${testSchema}"`);

      // Insert test health events
      await client.query(
        `
        INSERT INTO provider_health_events (chain_id, provider_name, event_type, health_score, metrics)
        VALUES 
          ($1, $2, 'health_check', 95, '{"latency": 150, "success_rate": 0.99}'),
          ($1, $2, 'health_check', 87, '{"latency": 280, "success_rate": 0.95}'),
          ($1, $2, 'health_degraded', 65, '{"latency": 450, "success_rate": 0.87}')
      `,
        [chainId, providerName]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Seed test data for circuit breaker testing
   */
  public static async seedCircuitBreakerData(
    postgres: Pool,
    testSchema: string,
    chainId: number,
    providerName: string
  ): Promise<void> {
    const client = await postgres.connect();

    try {
      await client.query(`SET search_path TO "${testSchema}"`);

      // Insert test circuit breaker events
      await client.query(
        `
        INSERT INTO circuit_breaker_events (chain_id, provider_name, state, failure_count, last_failure_time)
        VALUES 
          ($1, $2, 'CLOSED', 0, NULL),
          ($1, $2, 'OPEN', 5, NOW() - INTERVAL '30 seconds'),
          ($1, $2, 'HALF_OPEN', 2, NOW() - INTERVAL '10 seconds')
      `,
        [chainId, providerName]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Create test Redis data for price caching
   */
  public static async seedRedisPriceData(redis: Redis): Promise<void> {
    const testPriceData = {
      'price:ETH:USDC:arbitrum': JSON.stringify({
        price: '3456.78',
        timestamp: Date.now(),
        source: 'uniswap_v3',
      }),
      'price:WBTC:ETH:polygon': JSON.stringify({
        price: '15.234',
        timestamp: Date.now(),
        source: 'sushiswap',
      }),
    };

    for (const [key, value] of Object.entries(testPriceData)) {
      await redis.setex(key, 30, value);
    }
  }

  /**
   * Verify test data integrity
   */
  public static async verifyTestData(instance: TestDatabaseInstance): Promise<boolean> {
    try {
      // Verify Redis test data
      const keys = await instance.redis.keys('*');

      // Verify PostgreSQL test data
      const client = await instance.postgres.connect();
      const result = await client.query('SELECT COUNT(*) FROM provider_health_events');
      client.release();

      this.logger.debug('Test data verification complete', {
        testId: instance.testId,
        redisKeys: keys.length,
        postgresRows: result.rows[0].count,
      });

      return true;
    } catch (error) {
      this.logger.error('Test data verification failed', {
        testId: instance.testId,
        error,
      });
      return false;
    }
  }
}
