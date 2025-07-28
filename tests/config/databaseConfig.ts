/**
 * 🗄️ Database Configuration for Testing
 * 
 * Test database configurations for Redis and PostgreSQL instances.
 * Provides isolated test environments with proper cleanup procedures.
 * 
 * @fileoverview Database configuration for MEV arbitrage bot testing
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { RedisTestConfig, PostgresTestConfig } from '../helpers/TestDatabases';

/**
 * Redis test database configurations
 */
export const redisTestConfigs = {
  unit: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    database: 14, // Isolated test database
    connectTimeout: 5000,
    commandTimeout: 3000
  } as RedisTestConfig,

  integration: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    database: 15, // Different isolated test database
    connectTimeout: 10000,
    commandTimeout: 5000
  } as RedisTestConfig,

  e2e: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    database: 14, // Reuse unit test database for E2E
    connectTimeout: 15000,
    commandTimeout: 10000
  } as RedisTestConfig
};

/**
 * PostgreSQL test database configurations
 */
export const postgresTestConfigs = {
  unit: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_APP_DB || 'flash_arbitrage_bot',
    user: process.env.POSTGRES_APP_USER || 'flash_arbitrage_user',
    password: process.env.POSTGRES_APP_PASSWORD || 'flash_arbitrage_dev',
    max: 5, // Smaller pool for unit tests
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000
  } as PostgresTestConfig,

  integration: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_APP_DB || 'flash_arbitrage_bot',
    user: process.env.POSTGRES_APP_USER || 'flash_arbitrage_user',
    password: process.env.POSTGRES_APP_PASSWORD || 'flash_arbitrage_dev',
    max: 10, // Medium pool for integration tests
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  } as PostgresTestConfig,

  e2e: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_APP_DB || 'flash_arbitrage_bot',
    user: process.env.POSTGRES_APP_USER || 'flash_arbitrage_user',
    password: process.env.POSTGRES_APP_PASSWORD || 'flash_arbitrage_dev',
    max: 15, // Larger pool for E2E tests
    idleTimeoutMillis: 60000,
    connectionTimeoutMillis: 15000
  } as PostgresTestConfig
};

/**
 * Test database cleanup configurations
 */
export const cleanupConfigs = {
  unit: {
    clearRedisOnSetup: true,
    clearRedisOnTeardown: true,
    dropSchemaOnSetup: true,
    dropSchemaOnTeardown: true,
    retainDataForDebugging: false
  },

  integration: {
    clearRedisOnSetup: true,
    clearRedisOnTeardown: true,
    dropSchemaOnSetup: true,
    dropSchemaOnTeardown: true,
    retainDataForDebugging: false
  },

  e2e: {
    clearRedisOnSetup: true,
    clearRedisOnTeardown: false, // Keep data for analysis
    dropSchemaOnSetup: true,
    dropSchemaOnTeardown: false, // Keep schema for analysis
    retainDataForDebugging: true
  },

  dev: {
    clearRedisOnSetup: false, // Don't clear in development
    clearRedisOnTeardown: false,
    dropSchemaOnSetup: false,
    dropSchemaOnTeardown: false,
    retainDataForDebugging: true
  }
};

/**
 * Get Redis configuration for test type
 */
export function getRedisConfig(testType: 'unit' | 'integration' | 'e2e'): RedisTestConfig {
  return { ...redisTestConfigs[testType] };
}

/**
 * Get PostgreSQL configuration for test type
 */
export function getPostgresConfig(testType: 'unit' | 'integration' | 'e2e'): PostgresTestConfig {
  return { ...postgresTestConfigs[testType] };
}

/**
 * Get cleanup configuration for test type
 */
export function getCleanupConfig(testType: 'unit' | 'integration' | 'e2e' | 'dev') {
  return { ...cleanupConfigs[testType] };
}

/**
 * Test data seeding configurations
 */
export const seedConfigs = {
  minimal: {
    providerHealthEvents: 10,
    circuitBreakerEvents: 5,
    failoverEvents: 3,
    performanceSnapshots: 15
  },

  standard: {
    providerHealthEvents: 50,
    circuitBreakerEvents: 20,
    failoverEvents: 10,
    performanceSnapshots: 100
  },

  comprehensive: {
    providerHealthEvents: 200,
    circuitBreakerEvents: 50,
    failoverEvents: 25,
    performanceSnapshots: 500
  }
};

/**
 * Database schema validation queries
 */
export const validationQueries = {
  redis: {
    connectivity: 'PING',
    keyCount: 'DBSIZE',
    memory: 'INFO memory'
  },

  postgres: {
    connectivity: 'SELECT 1',
    schemaExists: `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata 
        WHERE schema_name = $1
      )
    `,
    tableCount: `
      SELECT COUNT(*) FROM information_schema.tables 
      WHERE table_schema = $1
    `,
    healthEventsCount: `
      SELECT COUNT(*) FROM provider_health_events
    `
  }
};

/**
 * Performance monitoring queries for test databases
 */
export const performanceQueries = {
  redis: {
    commandStats: 'INFO commandstats',
    slowlog: 'SLOWLOG GET 10',
    clients: 'CLIENT LIST',
    memory: 'MEMORY USAGE test_key'
  },

  postgres: {
    activeConnections: `
      SELECT count(*) as active_connections 
      FROM pg_stat_activity 
      WHERE state = 'active'
    `,
    slowQueries: `
      SELECT query, mean_time, calls 
      FROM pg_stat_statements 
      WHERE mean_time > 100 
      ORDER BY mean_time DESC 
      LIMIT 10
    `,
    tableStats: `
      SELECT 
        schemaname, 
        tablename, 
        n_tup_ins, 
        n_tup_upd, 
        n_tup_del,
        n_live_tup,
        n_dead_tup
      FROM pg_stat_user_tables 
      WHERE schemaname LIKE 'test_%'
    `
  }
};

/**
 * Test database connection pools configuration
 */
export const connectionPoolConfigs = {
  unit: {
    redis: {
      maxConnections: 5,
      minConnections: 1,
      acquireTimeoutMs: 5000,
      createTimeoutMs: 3000,
      destroyTimeoutMs: 2000,
      idleTimeoutMs: 10000,
      reapIntervalMs: 1000
    },
    postgres: {
      maxConnections: 5,
      minConnections: 1,
      acquireTimeoutMs: 10000,
      createTimeoutMs: 5000,
      destroyTimeoutMs: 3000,
      idleTimeoutMs: 30000,
      reapIntervalMs: 1000
    }
  },

  integration: {
    redis: {
      maxConnections: 10,
      minConnections: 2,
      acquireTimeoutMs: 10000,
      createTimeoutMs: 5000,
      destroyTimeoutMs: 3000,
      idleTimeoutMs: 30000,
      reapIntervalMs: 1000
    },
    postgres: {
      maxConnections: 10,
      minConnections: 2,
      acquireTimeoutMs: 15000,
      createTimeoutMs: 10000,
      destroyTimeoutMs: 5000,
      idleTimeoutMs: 60000,
      reapIntervalMs: 1000
    }
  },

  e2e: {
    redis: {
      maxConnections: 15,
      minConnections: 3,
      acquireTimeoutMs: 15000,
      createTimeoutMs: 10000,
      destroyTimeoutMs: 5000,
      idleTimeoutMs: 60000,
      reapIntervalMs: 1000
    },
    postgres: {
      maxConnections: 15,
      minConnections: 3,
      acquireTimeoutMs: 20000,
      createTimeoutMs: 15000,
      destroyTimeoutMs: 10000,
      idleTimeoutMs: 120000,
      reapIntervalMs: 1000
    }
  }
};

/**
 * Database health check configurations
 */
export const healthCheckConfigs = {
  redis: {
    enabled: true,
    intervalMs: 30000,
    timeoutMs: 5000,
    retries: 3,
    commands: ['PING', 'INFO replication']
  },

  postgres: {
    enabled: true,
    intervalMs: 45000,
    timeoutMs: 10000,
    retries: 3,
    queries: [
      'SELECT 1',
      'SELECT current_database()',
      'SELECT version()'
    ]
  }
};

/**
 * Test data retention policies
 */
export const retentionPolicies = {
  development: {
    redis: {
      ttlSeconds: 3600, // 1 hour
      maxKeys: 10000
    },
    postgres: {
      retentionDays: 7,
      maxRows: 100000
    }
  },

  testing: {
    redis: {
      ttlSeconds: 300, // 5 minutes
      maxKeys: 1000
    },
    postgres: {
      retentionDays: 1,
      maxRows: 10000
    }
  },

  ci: {
    redis: {
      ttlSeconds: 60, // 1 minute
      maxKeys: 500
    },
    postgres: {
      retentionDays: 0, // Immediate cleanup
      maxRows: 1000
    }
  }
};

/**
 * Get complete database configuration for test environment
 */
export function getDatabaseConfig(
  testType: 'unit' | 'integration' | 'e2e',
  environment: 'development' | 'testing' | 'ci' = 'testing'
) {
  return {
    redis: {
      config: getRedisConfig(testType),
      connectionPool: connectionPoolConfigs[testType].redis,
      healthCheck: healthCheckConfigs.redis,
      retention: retentionPolicies[environment].redis
    },
    postgres: {
      config: getPostgresConfig(testType),
      connectionPool: connectionPoolConfigs[testType].postgres,
      healthCheck: healthCheckConfigs.postgres,
      retention: retentionPolicies[environment].postgres
    },
    cleanup: getCleanupConfig(testType),
    seeding: seedConfigs.standard
  };
}

/**
 * Validate database configuration
 */
export function validateDatabaseConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate Redis config
  if (!config.redis?.config?.host) {
    errors.push('Redis host is required');
  }
  if (!config.redis?.config?.port || config.redis.config.port <= 0) {
    errors.push('Valid Redis port is required');
  }
  if (config.redis?.config?.database < 0 || config.redis.config.database > 15) {
    errors.push('Redis database must be between 0-15');
  }

  // Validate PostgreSQL config
  if (!config.postgres?.config?.host) {
    errors.push('PostgreSQL host is required');
  }
  if (!config.postgres?.config?.port || config.postgres.config.port <= 0) {
    errors.push('Valid PostgreSQL port is required');
  }
  if (!config.postgres?.config?.database) {
    errors.push('PostgreSQL database name is required');
  }
  if (!config.postgres?.config?.user) {
    errors.push('PostgreSQL user is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
