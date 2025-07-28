/**
 * 🔧 Test Environment Configurations
 * 
 * Enterprise test environment configurations for different testing scenarios.
 * Provides optimized settings for unit, integration, and e2e testing.
 * 
 * @fileoverview Test environment configurations for MEV arbitrage bot
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { TestEnvironmentConfig } from '../helpers/TestEnvironment';

/**
 * Unit test environment configuration
 */
export const unitTestConfig: TestEnvironmentConfig = {
  testName: 'unit',
  isolationLevel: 'unit',
  enableRealRpc: false,
  enableRealWebSockets: false,
  enableRealDatabases: true, // Real databases for better unit testing
  chainIds: [42161], // Arbitrum only for faster unit tests
  performance: {
    timeoutMs: 10000, // 10 seconds
    maxMemoryMB: 256,
    maxCpuPercent: 50
  },
  cleanup: {
    autoCleanup: true,
    cleanupTimeoutMs: 5000
  }
};

/**
 * Integration test environment configuration
 */
export const integrationTestConfig: TestEnvironmentConfig = {
  testName: 'integration',
  isolationLevel: 'integration',
  enableRealRpc: true,
  enableRealWebSockets: true,
  enableRealDatabases: true,
  chainIds: [42161, 137], // Arbitrum and Polygon
  performance: {
    timeoutMs: 30000, // 30 seconds
    maxMemoryMB: 512,
    maxCpuPercent: 75
  },
  cleanup: {
    autoCleanup: true,
    cleanupTimeoutMs: 10000
  }
};

/**
 * End-to-end test environment configuration
 */
export const e2eTestConfig: TestEnvironmentConfig = {
  testName: 'e2e',
  isolationLevel: 'e2e',
  enableRealRpc: true,
  enableRealWebSockets: true,
  enableRealDatabases: true,
  chainIds: [42161, 137, 8453], // All three chains
  performance: {
    timeoutMs: 60000, // 60 seconds
    maxMemoryMB: 1024,
    maxCpuPercent: 90
  },
  cleanup: {
    autoCleanup: true,
    cleanupTimeoutMs: 15000
  }
};

/**
 * Load test environment configuration
 */
export const loadTestConfig: TestEnvironmentConfig = {
  testName: 'load',
  isolationLevel: 'e2e',
  enableRealRpc: true,
  enableRealWebSockets: true,
  enableRealDatabases: true,
  chainIds: [42161, 137, 8453],
  performance: {
    timeoutMs: 120000, // 2 minutes
    maxMemoryMB: 2048,
    maxCpuPercent: 95
  },
  cleanup: {
    autoCleanup: true,
    cleanupTimeoutMs: 30000
  }
};

/**
 * Development test environment configuration
 */
export const devTestConfig: TestEnvironmentConfig = {
  testName: 'dev',
  isolationLevel: 'integration',
  enableRealRpc: false, // Use mocks for faster development
  enableRealWebSockets: false,
  enableRealDatabases: true,
  chainIds: [42161],
  performance: {
    timeoutMs: 15000,
    maxMemoryMB: 512,
    maxCpuPercent: 60
  },
  cleanup: {
    autoCleanup: true,
    cleanupTimeoutMs: 7500
  }
};

/**
 * CI/CD test environment configuration
 */
export const ciTestConfig: TestEnvironmentConfig = {
  testName: 'ci',
  isolationLevel: 'integration',
  enableRealRpc: true,
  enableRealWebSockets: false, // Disable WebSockets in CI for stability
  enableRealDatabases: true,
  chainIds: [42161], // Single chain for CI speed
  performance: {
    timeoutMs: 45000, // CI environments can be slower
    maxMemoryMB: 768,
    maxCpuPercent: 80
  },
  cleanup: {
    autoCleanup: true,
    cleanupTimeoutMs: 20000 // Longer cleanup timeout for CI
  }
};

/**
 * MEV performance test configuration
 */
export const mevPerformanceConfig: TestEnvironmentConfig = {
  testName: 'mev-performance',
  isolationLevel: 'e2e',
  enableRealRpc: true,
  enableRealWebSockets: true,
  enableRealDatabases: true,
  chainIds: [42161, 137, 8453],
  performance: {
    timeoutMs: 90000,
    maxMemoryMB: 1536,
    maxCpuPercent: 85
  },
  cleanup: {
    autoCleanup: true,
    cleanupTimeoutMs: 25000
  }
};

/**
 * Stress test environment configuration
 */
export const stressTestConfig: TestEnvironmentConfig = {
  testName: 'stress',
  isolationLevel: 'e2e',
  enableRealRpc: true,
  enableRealWebSockets: true,
  enableRealDatabases: true,
  chainIds: [42161, 137, 8453],
  performance: {
    timeoutMs: 300000, // 5 minutes
    maxMemoryMB: 4096,
    maxCpuPercent: 100
  },
  cleanup: {
    autoCleanup: true,
    cleanupTimeoutMs: 60000
  }
};

/**
 * All available test configurations
 */
export const testConfigurations = {
  unit: unitTestConfig,
  integration: integrationTestConfig,
  e2e: e2eTestConfig,
  load: loadTestConfig,
  dev: devTestConfig,
  ci: ciTestConfig,
  mevPerformance: mevPerformanceConfig,
  stress: stressTestConfig
};

/**
 * Get test configuration by name
 */
export function getTestConfig(name: keyof typeof testConfigurations): TestEnvironmentConfig {
  const config = testConfigurations[name];
  if (!config) {
    throw new Error(`Unknown test configuration: ${name}`);
  }
  return { ...config }; // Return a copy to prevent mutation
}

/**
 * Create custom test configuration based on existing one
 */
export function createCustomConfig(
  baseName: keyof typeof testConfigurations,
  overrides: Partial<TestEnvironmentConfig>
): TestEnvironmentConfig {
  const baseConfig = getTestConfig(baseName);
  return {
    ...baseConfig,
    ...overrides,
    performance: {
      ...baseConfig.performance,
      ...overrides.performance
    },
    cleanup: {
      ...baseConfig.cleanup,
      ...overrides.cleanup
    }
  };
}

/**
 * Validate test configuration
 */
export function validateConfig(config: TestEnvironmentConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.testName?.trim()) {
    errors.push('Test name is required');
  }

  if (!['unit', 'integration', 'e2e'].includes(config.isolationLevel)) {
    errors.push('Invalid isolation level');
  }

  if (!Array.isArray(config.chainIds) || config.chainIds.length === 0) {
    errors.push('At least one chain ID is required');
  }

  if (config.performance.timeoutMs <= 0) {
    errors.push('Timeout must be positive');
  }

  if (config.performance.maxMemoryMB <= 0) {
    errors.push('Max memory must be positive');
  }

  if (config.performance.maxCpuPercent <= 0 || config.performance.maxCpuPercent > 100) {
    errors.push('Max CPU percent must be between 1 and 100');
  }

  if (config.cleanup.cleanupTimeoutMs <= 0) {
    errors.push('Cleanup timeout must be positive');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Environment-specific configuration adjustments
 */
export function getEnvironmentConfig(): {
  isDevelopment: boolean;
  isCI: boolean;
  isProduction: boolean;
  recommended: keyof typeof testConfigurations;
} {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isCI = !!(process.env.CI || process.env.CONTINUOUS_INTEGRATION);
  
  const isDevelopment = nodeEnv === 'development';
  const isProduction = nodeEnv === 'production';

  let recommended: keyof typeof testConfigurations;
  
  if (isCI) {
    recommended = 'ci';
  } else if (isDevelopment) {
    recommended = 'dev';
  } else if (isProduction) {
    recommended = 'integration';
  } else {
    recommended = 'unit';
  }

  return {
    isDevelopment,
    isCI,
    isProduction,
    recommended
  };
}
