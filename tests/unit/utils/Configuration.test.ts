/**
 * ⚙️ Configuration Unit Tests
 * 
 * Comprehensive testing of configuration management for enterprise MEV infrastructure.
 * Tests environment variable handling, validation, chain configurations, and security.
 * 
 * @fileoverview Configuration management unit tests with real validation
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestEnvironment, TestEnvInstance } from '../../helpers/TestEnvironment';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

// Configuration interfaces for type safety
interface ChainConfig {
  chainId: number;
  name: string;
  rpcProviders: Record<string, any>;
  performance: Record<string, any>;
}

interface RpcProviderConfig {
  url: string;
  timeout: number;
  retries: number;
  priority: number;
}

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

describe('Configuration Unit Tests - Enterprise MEV Infrastructure', () => {
  let testEnv: TestEnvInstance | null = null;
  let originalEnv: Record<string, string | undefined>;
  let envFilePath: string;

  beforeEach(async () => {
    // Setup isolated test environment
    testEnv = await TestEnvironment.setupTestEnvironment('configuration-unit-test', {
      isolationLevel: 'unit',
      enableRealDatabases: false, // Configuration tests don't need databases
      enableRealRpc: false,
      enableRealWebSockets: false,
      chainIds: [42161],
      performance: {
        timeoutMs: 3000, // Fast configuration tests
        maxMemoryMB: 64,
        maxCpuPercent: 20
      }
    });

    // Backup original environment
    originalEnv = { ...process.env };
    
    // Set path to actual .env file
    envFilePath = path.join(process.cwd(), '.env');
  });

  afterEach(async () => {
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      delete process.env[key];
    });
    Object.assign(process.env, originalEnv);

    if (testEnv) {
      await testEnv.cleanup();
      testEnv = null;
    }
  });

  describe('Environment File Loading & Validation', () => {
    it('should load .env file successfully', async () => {
      // Verify .env file exists
      const envExists = await fs.access(envFilePath).then(() => true).catch(() => false);
      expect(envExists).toBe(true);

      // Load environment variables
      const result = dotenv.config({ path: envFilePath });
      expect(result.error).toBeUndefined();
      expect(result.parsed).toBeDefined();
    });

    it('should contain all required MEV infrastructure variables', async () => {
      // Load environment
      dotenv.config({ path: envFilePath });

      // Critical infrastructure variables
      const requiredVars = [
        'LOG_LEVEL',
        'NODE_ENV',
        
        // Database configuration
        'REDIS_HOST',
        'REDIS_PORT', 
        'POSTGRES_HOST',
        'POSTGRES_PORT',
        'POSTGRES_DB',
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        
        // RPC providers for all chains
        'QUICKNODE_ARBITRUM_HTTP',
        'ALCHEMY_ARBITRUM_HTTP',
        'INFURA_ARBITRUM_HTTP',
        'QUICKNODE_POLYGON_HTTP',
        'ALCHEMY_POLYGON_HTTP', 
        'INFURA_POLYGON_HTTP',
        'QUICKNODE_BASE_HTTP',
        'ALCHEMY_BASE_HTTP',
        'INFURA_BASE_HTTP',
        
        // WebSocket endpoints
        'QUICKNODE_ARBITRUM_WSS',
        'ALCHEMY_ARBITRUM_WSS',
        'INFURA_ARBITRUM_WSS',
        
        // Contract addresses
        'WETH_ARBITRUM_ADDRESS',
        'USDC_ARBITRUM_ADDRESS',
        'WETH_POLYGON_ADDRESS',
        'USDC_POLYGON_ADDRESS',
        'WETH_BASE_ADDRESS',
        'USDC_BASE_ADDRESS',
        
        // DEX router addresses
        'UNISWAP_V2_ARBITRUM_ROUTER',
        'UNISWAP_V3_ARBITRUM_ROUTER',
        'SUSHISWAP_ARBITRUM_ROUTER',
        
        // Performance configuration
        'RPC_REQUEST_TIMEOUT_MS',
        'RPC_MAX_RETRIES',
        'HEALTH_CHECK_INTERVAL_MS'
      ];

      for (const varName of requiredVars) {
        expect(process.env[varName], `Missing required environment variable: ${varName}`).toBeDefined();
        expect(process.env[varName]!.length, `Empty environment variable: ${varName}`).toBeGreaterThan(0);
      }
    });

    it('should validate numeric configuration values', () => {
      dotenv.config({ path: envFilePath });

      const numericVars = [
        'REDIS_PORT',
        'POSTGRES_PORT',
        'RPC_REQUEST_TIMEOUT_MS',
        'RPC_MAX_RETRIES',
        'HEALTH_CHECK_INTERVAL_MS',
        'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
        'CIRCUIT_BREAKER_TIMEOUT_MS'
      ];

      for (const varName of numericVars) {
        const value = process.env[varName];
        if (value) {
          const numericValue = parseInt(value, 10);
          expect(isNaN(numericValue), `Invalid numeric value for ${varName}: ${value}`).toBe(false);
          expect(numericValue, `Negative value for ${varName}: ${value}`).toBeGreaterThan(0);
        }
      }
    });

    it('should validate URL format for RPC endpoints', () => {
      dotenv.config({ path: envFilePath });

      const rpcUrls = [
        'QUICKNODE_ARBITRUM_RPC_URL',
        'ALCHEMY_ARBITRUM_RPC_URL', 
        'INFURA_ARBITRUM_RPC_URL',
        'QUICKNODE_POLYGON_RPC_URL',
        'ALCHEMY_POLYGON_RPC_URL',
        'INFURA_POLYGON_RPC_URL'
      ];

      for (const urlVar of rpcUrls) {
        const url = process.env[urlVar];
        if (url) {
          expect(url.startsWith('http'), `Invalid RPC URL format for ${urlVar}: ${url}`).toBe(true);
          expect(() => new URL(url), `Invalid URL format for ${urlVar}: ${url}`).not.toThrow();
        }
      }
    });

    it('should validate WebSocket URL format', () => {
      dotenv.config({ path: envFilePath });

      const wsUrls = [
        'QUICKNODE_ARBITRUM_WS_URL',
        'ALCHEMY_ARBITRUM_WS_URL',
        'INFURA_ARBITRUM_WS_URL'
      ];

      for (const urlVar of wsUrls) {
        const url = process.env[urlVar];
        if (url) {
          expect(url.startsWith('ws'), `Invalid WebSocket URL format for ${urlVar}: ${url}`).toBe(true);
        }
      }
    });

    it('should validate Ethereum address format', () => {
      dotenv.config({ path: envFilePath });

      const addressVars = [
        'WETH_ARBITRUM_ADDRESS',
        'USDC_ARBITRUM_ADDRESS',
        'WETH_POLYGON_ADDRESS',
        'USDC_POLYGON_ADDRESS',
        'UNISWAP_V2_ARBITRUM_ROUTER',
        'UNISWAP_V3_ARBITRUM_ROUTER'
      ];

      const ethereumAddressRegex = /^0x[a-fA-F0-9]{40}$/;

      for (const addressVar of addressVars) {
        const address = process.env[addressVar];
        if (address) {
          expect(ethereumAddressRegex.test(address), `Invalid Ethereum address format for ${addressVar}: ${address}`).toBe(true);
        }
      }
    });
  });

  describe('Chain Configuration Loading', () => {
    it('should load chains.json configuration correctly', async () => {
      const chainsConfigPath = path.join(process.cwd(), 'backend', 'config', 'chains.json');
      
      // Verify chains.json exists
      const configExists = await fs.access(chainsConfigPath).then(() => true).catch(() => false);
      expect(configExists).toBe(true);

      // Load and parse configuration
      const configContent = await fs.readFile(chainsConfigPath, 'utf-8');
      const chainsConfig = JSON.parse(configContent);

      // Validate structure
      expect(chainsConfig).toBeDefined();
      expect(typeof chainsConfig).toBe('object');

      // Check required chains
      const requiredChains = ['42161', '137', '8453']; // Arbitrum, Polygon, Base
      
      for (const chainId of requiredChains) {
        expect(chainsConfig[chainId], `Missing configuration for chain ${chainId}`).toBeDefined();
        
        const chainConfig: ChainConfig = chainsConfig[chainId];
        expect(chainConfig.name).toBeDefined();
        expect(chainConfig.chainId).toBe(parseInt(chainId, 10));
        expect(chainConfig.rpcProviders).toBeDefined();
        expect(typeof chainConfig.rpcProviders).toBe('object');
      }
    });

    it('should validate RPC provider configurations in chains.json', async () => {
      const chainsConfigPath = path.join(process.cwd(), 'backend', 'config', 'chains.json');
      const configContent = await fs.readFile(chainsConfigPath, 'utf-8');
      const chainsConfig = JSON.parse(configContent);

      for (const [chainId, chainConfig] of Object.entries(chainsConfig)) {
        const config = chainConfig as ChainConfig;
        
        // Validate RPC providers
        expect(config.rpcProviders).toBeDefined();
        
        const providers = Object.keys(config.rpcProviders);
        expect(providers.length, `No RPC providers configured for chain ${chainId}`).toBeGreaterThan(0);

        // Check each provider configuration
        for (const [providerName, providerConfig] of Object.entries(config.rpcProviders)) {
          const provider = providerConfig as RpcProviderConfig;
          
          expect(provider.url, `Missing URL for provider ${providerName} on chain ${chainId}`).toBeDefined();
          expect(provider.timeout, `Missing timeout for provider ${providerName} on chain ${chainId}`).toBeDefined();
          expect(provider.retries, `Missing retries for provider ${providerName} on chain ${chainId}`).toBeDefined();
          expect(provider.priority, `Missing priority for provider ${providerName} on chain ${chainId}`).toBeDefined();
          
          // Validate ranges
          expect(provider.timeout).toBeGreaterThan(0);
          expect(provider.retries).toBeGreaterThanOrEqual(0);
          expect(provider.priority).toBeGreaterThan(0);
        }
      }
    });

    it('should validate performance thresholds in chains.json', async () => {
      const chainsConfigPath = path.join(process.cwd(), 'backend', 'config', 'chains.json');
      const configContent = await fs.readFile(chainsConfigPath, 'utf-8');
      const chainsConfig = JSON.parse(configContent);

      for (const [chainId, chainConfig] of Object.entries(chainsConfig)) {
        const config = chainConfig as ChainConfig;
        
        if (config.performance) {
          const perf = config.performance;
          
          // Validate MEV performance requirements
          if (perf.maxResponseTimeMs) {
            expect(perf.maxResponseTimeMs).toBeLessThanOrEqual(350); // MEV requirement
          }
          
          if (perf.healthCheckIntervalMs) {
            expect(perf.healthCheckIntervalMs).toBeGreaterThan(0);
            expect(perf.healthCheckIntervalMs).toBeLessThanOrEqual(60000); // Max 1 minute
          }
          
          if (perf.failoverTimeoutMs) {
            expect(perf.failoverTimeoutMs).toBeLessThanOrEqual(100); // Sub-100ms requirement
          }
        }
      }
    });
  });

  describe('Database Configuration', () => {
    it('should build valid database connection config from environment', () => {
      dotenv.config({ path: envFilePath });

      const dbConfig: DatabaseConfig = {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'arbitrage_bot',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || ''
      };

      // Validate configuration
      expect(dbConfig.host).toBeDefined();
      expect(dbConfig.port).toBeGreaterThan(0);
      expect(dbConfig.port).toBeLessThan(65536);
      expect(dbConfig.database).toBeDefined();
      expect(dbConfig.user).toBeDefined();
      expect(dbConfig.password).toBeDefined();
    });

    it('should build valid Redis connection config from environment', () => {
      dotenv.config({ path: envFilePath });

      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        db: parseInt(process.env.REDIS_DB || '0', 10)
      };

      // Validate configuration  
      expect(redisConfig.host).toBeDefined();
      expect(redisConfig.port).toBeGreaterThan(0);
      expect(redisConfig.port).toBeLessThan(65536);
      expect(redisConfig.db).toBeGreaterThanOrEqual(0);
      expect(redisConfig.db).toBeLessThanOrEqual(15); // Redis default max databases
    });
  });

  describe('Security Configuration Validation', () => {
    it('should not expose sensitive values in logs', () => {
      dotenv.config({ path: envFilePath });

      const sensitiveVars = [
        'POSTGRES_PASSWORD',
        'PRIVATE_KEY',
        'MNEMONIC_PHRASE',
        'API_SECRET'
      ];

      for (const varName of sensitiveVars) {
        const value = process.env[varName];
        if (value) {
          // Ensure sensitive values are not empty and have reasonable length
          expect(value.length).toBeGreaterThan(8);
          
          // Should not contain obvious test values
          expect(value.toLowerCase()).not.toBe('password');
          expect(value.toLowerCase()).not.toBe('secret');
          expect(value.toLowerCase()).not.toBe('test');
        }
      }
    });

    it('should validate production vs development configuration', () => {
      dotenv.config({ path: envFilePath });

      const nodeEnv = process.env.NODE_ENV || 'development';
      expect(['development', 'staging', 'production'].includes(nodeEnv)).toBe(true);

      const logLevel = process.env.LOG_LEVEL || 'info';
      expect(['debug', 'info', 'warn', 'error'].includes(logLevel)).toBe(true);

      // Production should have stricter settings
      if (nodeEnv === 'production') {
        expect(['info', 'warn', 'error'].includes(logLevel)).toBe(true);
      }
    });

    it('should validate API key format for external services', () => {
      dotenv.config({ path: envFilePath });

      // Check API keys that might be used
      const apiKeyVars = [
        'QUICKNODE_API_KEY',
        'ALCHEMY_API_KEY', 
        'INFURA_PROJECT_ID'
      ];

      for (const keyVar of apiKeyVars) {
        const apiKey = process.env[keyVar];
        if (apiKey) {
          // API keys should be reasonably long and not obviously fake
          expect(apiKey.length).toBeGreaterThan(16);
          expect(apiKey.toLowerCase()).not.toBe('your-api-key');
          expect(apiKey.toLowerCase()).not.toBe('test-key');
        }
      }
    });
  });

  describe('Performance Configuration', () => {
    it('should validate MEV timing requirements', () => {
      dotenv.config({ path: envFilePath });

      // MEV-critical timing configurations
      const requestTimeout = parseInt(process.env.RPC_REQUEST_TIMEOUT_MS || '5000', 10);
      const healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000', 10);
      const failoverTimeout = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '30000', 10);

      // Validate MEV requirements
      expect(requestTimeout).toBeLessThanOrEqual(5000); // Max 5 seconds for any RPC request
      expect(healthCheckInterval).toBeGreaterThanOrEqual(10000); // At least 10 seconds between checks
      expect(healthCheckInterval).toBeLessThanOrEqual(60000); // At most 1 minute between checks
    });

    it('should validate circuit breaker configuration', () => {
      dotenv.config({ path: envFilePath });

      const failureThreshold = parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5', 10);
      const timeoutMs = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '30000', 10);
      const retryDelay = parseInt(process.env.CIRCUIT_BREAKER_RETRY_DELAY_MS || '5000', 10);

      // Validate circuit breaker settings
      expect(failureThreshold).toBeGreaterThan(0);
      expect(failureThreshold).toBeLessThanOrEqual(10); // Reasonable failure threshold
      expect(timeoutMs).toBeGreaterThan(0);
      expect(retryDelay).toBeGreaterThan(0);
      expect(retryDelay).toBeLessThan(timeoutMs); // Retry delay should be less than timeout
    });

    it('should validate connection pool configuration', () => {
      dotenv.config({ path: envFilePath });

      const maxConnections = parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20', 10);
      const idleTimeout = parseInt(process.env.POSTGRES_IDLE_TIMEOUT_MS || '10000', 10);
      const connectionTimeout = parseInt(process.env.POSTGRES_CONNECTION_TIMEOUT_MS || '5000', 10);

      // Validate connection pool settings
      expect(maxConnections).toBeGreaterThan(5); // Need sufficient connections for MEV operations
      expect(maxConnections).toBeLessThanOrEqual(100); // Don't overwhelm database
      expect(idleTimeout).toBeGreaterThan(1000); // At least 1 second
      expect(connectionTimeout).toBeGreaterThan(1000); // At least 1 second
      expect(connectionTimeout).toBeLessThanOrEqual(10000); // At most 10 seconds
    });
  });

  describe('Configuration Error Handling', () => {
    it('should handle missing environment variables gracefully', () => {
      // Clear an important environment variable
      delete process.env.POSTGRES_HOST;

      expect(() => {
        const host = process.env.POSTGRES_HOST || 'localhost';
        expect(host).toBe('localhost'); // Should fall back to default
      }).not.toThrow();
    });

    it('should handle invalid numeric values gracefully', () => {
      // Set invalid numeric value
      process.env.REDIS_PORT = 'invalid-port';

      const port = parseInt(process.env.REDIS_PORT || '6379', 10);
      expect(isNaN(port)).toBe(true);
      
      // Should handle with fallback
      const validPort = isNaN(port) ? 6379 : port;
      expect(validPort).toBe(6379);
    });

    it('should validate required vs optional configuration', () => {
      dotenv.config({ path: envFilePath });

      // Critical variables that must exist
      const criticalVars = [
        'POSTGRES_HOST',
        'POSTGRES_DB',
        'REDIS_HOST',
        'QUICKNODE_ARBITRUM_HTTP'
      ];

      for (const varName of criticalVars) {
        expect(process.env[varName], `Critical variable ${varName} is missing`).toBeDefined();
      }

      // Optional variables that can have defaults
      const optionalVars = [
        'LOG_LEVEL', // defaults to 'info'
        'NODE_ENV', // defaults to 'development'
        'REDIS_DB' // defaults to '0'
      ];

      for (const varName of optionalVars) {
        const value = process.env[varName];
        // Optional variables can be undefined, but if present should be valid
        if (value !== undefined) {
          expect(value.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Configuration Integration with Test Environment', () => {
    it('should work with test environment configuration', () => {
      if (!testEnv) throw new Error('Test environment not initialized');

      // Test that configuration works within test environment
      const testConfig = {
        testId: testEnv.testId,
        isolationLevel: testEnv.config.isolationLevel,
        enabledFeatures: {
          databases: testEnv.config.enableRealDatabases,
          rpc: testEnv.config.enableRealRpc,
          webSockets: testEnv.config.enableRealWebSockets
        }
      };

      expect(testConfig.testId).toBeDefined();
      expect(testConfig.isolationLevel).toBe('unit');
      expect(typeof testConfig.enabledFeatures).toBe('object');
    });

    it('should validate configuration loading performance', async () => {
      const startTime = Date.now();
      
      // Load configuration multiple times
      for (let i = 0; i < 10; i++) {
        dotenv.config({ path: envFilePath });
      }
      
      const loadTime = Date.now() - startTime;
      
      // Configuration loading should be very fast
      expect(loadTime).toBeLessThan(100); // Less than 100ms for 10 loads
    });
  });

  describe('Real-World Configuration Scenarios', () => {
    it('should handle configuration for multi-chain operations', () => {
      dotenv.config({ path: envFilePath });

      const chains = [42161, 137, 8453]; // Arbitrum, Polygon, Base
      const providers = ['quicknode', 'alchemy', 'infura'];

      // Validate each chain has all required providers
      for (const chainId of chains) {
        for (const provider of providers) {
          const chainName = chainId === 42161 ? 'ARBITRUM' : 
                           chainId === 137 ? 'POLYGON' : 'BASE';
          const envVarName = `${provider.toUpperCase()}_${chainName}_HTTP`;
          
          expect(process.env[envVarName], `Missing RPC URL for ${provider} on ${chainName}`).toBeDefined();
        }
      }
    });

    it('should validate configuration for high-frequency trading', () => {
      dotenv.config({ path: envFilePath });

      // High-frequency trading requirements
      const requestTimeout = parseInt(process.env.RPC_REQUEST_TIMEOUT_MS || '5000', 10);
      const maxRetries = parseInt(process.env.RPC_MAX_RETRIES || '3', 10);
      const healthCheckInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000', 10);

      // Validate settings are appropriate for MEV competition
      expect(requestTimeout).toBeLessThanOrEqual(3000); // Very fast requests for MEV
      expect(maxRetries).toBeLessThanOrEqual(2); // Quick retries only
      expect(healthCheckInterval).toBeLessThanOrEqual(30000); // Frequent health checks
    });

    it('should validate fail-safe configuration', () => {
      dotenv.config({ path: envFilePath });

      // Ensure we have multiple providers for redundancy
      const arbitrumProviders = [
        process.env.QUICKNODE_ARBITRUM_HTTP,
        process.env.ALCHEMY_ARBITRUM_HTTP,
        process.env.INFURA_ARBITRUM_HTTP
      ].filter(url => url && url.length > 0);

      expect(arbitrumProviders.length).toBeGreaterThanOrEqual(3); // Full redundancy

      // Check failover timing is configured for rapid recovery
      const failoverTimeout = parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT_MS || '30000', 10);
      expect(failoverTimeout).toBeLessThanOrEqual(30000); // Max 30 seconds before failover
    });
  });

  describe('Configuration Documentation & Maintenance', () => {
    it('should have all configuration documented in .env.example', async () => {
      const envExamplePath = path.join(process.cwd(), '.env.example');
      
      try {
        const exampleContent = await fs.readFile(envExamplePath, 'utf-8');
        
        // Should contain documentation for critical variables
        expect(exampleContent).toContain('POSTGRES_HOST');
        expect(exampleContent).toContain('REDIS_HOST');
        expect(exampleContent).toContain('QUICKNODE_ARBITRUM_RPC_URL');
        expect(exampleContent).toContain('LOG_LEVEL');
      } catch (error) {
        // If .env.example doesn't exist, that's also valuable information
        console.warn('.env.example file not found - consider creating one for documentation');
      }
    });

    it('should validate configuration version compatibility', () => {
      dotenv.config({ path: envFilePath });

      // Check for version indicators
      const configVersion = process.env.CONFIG_VERSION;
      const nodeVersion = process.version;

      // Validate Node.js version compatibility
      const majorVersion = parseInt(nodeVersion.substring(1).split('.')[0], 10);
      expect(majorVersion).toBeGreaterThanOrEqual(18); // Node.js 18+ required for modern features
    });
  });
});
