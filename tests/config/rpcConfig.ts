/**
 * 🌐 RPC Provider Configuration for Testing
 * 
 * Test RPC provider configurations for different blockchain networks.
 * Provides testnet endpoints, mock configurations, and health monitoring settings.
 * 
 * @fileoverview RPC provider configuration for MEV arbitrage bot testing
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { RpcTestConfig, MockRpcConfig, HealthSimulationConfig } from '../helpers/TestRpcProviders';

/**
 * Testnet RPC provider configurations
 */
export const testnetConfigs: Record<string, RpcTestConfig> = {
  sepolia: {
    chainId: 11155111,
    chainName: 'Sepolia',
    providers: {
      quicknode: {
        http: 'https://ethereum-sepolia.rpc.quicknode.pro/demo',
        wss: 'wss://ethereum-sepolia.rpc.quicknode.pro/demo'
      },
      alchemy: {
        http: 'https://eth-sepolia.g.alchemy.com/v2/demo',
        wss: 'wss://eth-sepolia.g.alchemy.com/v2/demo'
      },
      infura: {
        http: 'https://sepolia.infura.io/v3/demo',
        wss: 'wss://sepolia.infura.io/ws/v3/demo'
      }
    },
    performance: {
      expectedLatencyMs: 200,
      timeoutMs: 5000,
      retries: 3
    }
  },

  mumbai: {
    chainId: 80001,
    chainName: 'Mumbai',
    providers: {
      quicknode: {
        http: 'https://polygon-mumbai.rpc.quicknode.pro/demo',
        wss: 'wss://polygon-mumbai.rpc.quicknode.pro/demo'
      },
      alchemy: {
        http: 'https://polygon-mumbai.g.alchemy.com/v2/demo',
        wss: 'wss://polygon-mumbai.g.alchemy.com/v2/demo'
      },
      infura: {
        http: 'https://polygon-mumbai.infura.io/v3/demo',
        wss: 'wss://polygon-mumbai.infura.io/ws/v3/demo'
      }
    },
    performance: {
      expectedLatencyMs: 300,
      timeoutMs: 7000,
      retries: 3
    }
  },

  baseGoerli: {
    chainId: 84531,
    chainName: 'Base Goerli',
    providers: {
      quicknode: {
        http: 'https://base-goerli.rpc.quicknode.pro/demo',
        wss: 'wss://base-goerli.rpc.quicknode.pro/demo'
      },
      alchemy: {
        http: 'https://base-goerli.g.alchemy.com/v2/demo',
        wss: 'wss://base-goerli.g.alchemy.com/v2/demo'
      },
      infura: {
        http: 'https://base-goerli.infura.io/v3/demo',
        wss: 'wss://base-goerli.infura.io/ws/v3/demo'
      }
    },
    performance: {
      expectedLatencyMs: 250,
      timeoutMs: 6000,
      retries: 3
    }
  }
};

/**
 * Mock RPC provider configurations for unit testing
 */
export const mockConfigs: Record<string, MockRpcConfig> = {
  fastLocal: {
    chainId: 31337,
    responses: new Map([
      ['eth_blockNumber', '0x112a880'], // Block ~18M
      ['eth_getBalance', '0x56bc75e2d630e8000'], // 100 ETH
      ['eth_gasPrice', '0x4a817c800'], // 20 gwei
      ['eth_chainId', '0x7a69'], // 31337
      ['net_version', '31337']
    ]),
    latencyMs: 50,
    successRate: 1.0,
    enabled: true
  },

  slowLocal: {
    chainId: 31337,
    responses: new Map([
      ['eth_blockNumber', '0x112a880'],
      ['eth_getBalance', '0x56bc75e2d630e8000'],
      ['eth_gasPrice', '0x4a817c800'],
      ['eth_chainId', '0x7a69'],
      ['net_version', '31337']
    ]),
    latencyMs: 500,
    successRate: 0.95,
    enabled: true
  },

  unreliableLocal: {
    chainId: 31337,
    responses: new Map([
      ['eth_blockNumber', '0x112a880'],
      ['eth_getBalance', '0x56bc75e2d630e8000'],
      ['eth_gasPrice', '0x4a817c800'],
      ['eth_chainId', '0x7a69'],
      ['net_version', '31337']
    ]),
    latencyMs: 200,
    successRate: 0.8,
    enabled: true
  }
};

/**
 * Health simulation configurations for different scenarios
 */
export const healthSimulations: Record<string, HealthSimulationConfig> = {
  healthy: {
    baseLatency: 150,
    latencyVariation: 50,
    successRate: 0.99
  },

  degrading: {
    baseLatency: 200,
    latencyVariation: 100,
    successRate: 0.95,
    degradationPattern: 'linear'
  },

  unstable: {
    baseLatency: 300,
    latencyVariation: 200,
    successRate: 0.85,
    degradationPattern: 'random'
  },

  failing: {
    baseLatency: 500,
    latencyVariation: 300,
    successRate: 0.60,
    degradationPattern: 'exponential'
  },

  recovering: {
    baseLatency: 400,
    latencyVariation: 150,
    successRate: 0.70,
    degradationPattern: 'linear',
    recoverAfterMs: 30000
  },

  intermittent: {
    baseLatency: 250,
    latencyVariation: 500,
    successRate: 0.90,
    degradationPattern: 'random'
  }
};

/**
 * Chain-specific RPC configurations for production-like testing
 */
export const chainConfigs: Record<number, { 
  name: string; 
  testnet: keyof typeof testnetConfigs; 
  expectedBlockTime: number;
  gasSettings: {
    baseFee: string;
    maxPriorityFee: string;
    gasLimit: number;
  };
}> = {
  42161: {
    name: 'Arbitrum One',
    testnet: 'sepolia', // Use Sepolia as testnet for Arbitrum
    expectedBlockTime: 250, // ~250ms block time
    gasSettings: {
      baseFee: '0x174876e800', // 0.1 gwei
      maxPriorityFee: '0x174876e800', // 0.1 gwei
      gasLimit: 1000000
    }
  },

  137: {
    name: 'Polygon',
    testnet: 'mumbai',
    expectedBlockTime: 2000, // ~2s block time
    gasSettings: {
      baseFee: '0x4a817c800', // 20 gwei
      maxPriorityFee: '0x2540be400', // 10 gwei
      gasLimit: 1000000
    }
  },

  8453: {
    name: 'Base',
    testnet: 'baseGoerli',
    expectedBlockTime: 2000, // ~2s block time
    gasSettings: {
      baseFee: '0x174876e800', // 0.1 gwei
      maxPriorityFee: '0x174876e800', // 0.1 gwei
      gasLimit: 1000000
    }
  }
};

/**
 * Provider reliability tiers for testing
 */
export const providerTiers = {
  tier1: {
    name: 'Tier 1 - Premium',
    providers: ['quicknode'],
    expectedLatency: 150,
    expectedUptime: 0.999,
    rateLimit: 1000,
    features: ['websockets', 'archive', 'debug']
  },

  tier2: {
    name: 'Tier 2 - Standard',
    providers: ['alchemy', 'infura'],
    expectedLatency: 200,
    expectedUptime: 0.995,
    rateLimit: 500,
    features: ['websockets', 'archive']
  },

  tier3: {
    name: 'Tier 3 - Public',
    providers: ['public'],
    expectedLatency: 500,
    expectedUptime: 0.990,
    rateLimit: 100,
    features: ['basic']
  }
};

/**
 * Test scenarios for RPC provider testing
 */
export const testScenarios = {
  basicConnectivity: {
    name: 'Basic Connectivity Test',
    description: 'Test basic RPC connectivity and response',
    methods: ['eth_blockNumber', 'eth_chainId', 'net_version'],
    expectedLatency: 300,
    iterations: 10
  },

  performanceTest: {
    name: 'Performance Benchmark',
    description: 'Benchmark RPC provider performance',
    methods: ['eth_blockNumber', 'eth_getBalance', 'eth_gasPrice'],
    expectedLatency: 200,
    iterations: 100
  },

  reliabilityTest: {
    name: 'Reliability Test',
    description: 'Test provider reliability under load',
    methods: ['eth_blockNumber'],
    expectedLatency: 500,
    iterations: 1000,
    concurrency: 10
  },

  failoverTest: {
    name: 'Failover Test',
    description: 'Test provider failover capabilities',
    methods: ['eth_blockNumber'],
    expectedLatency: 100, // Fast failover requirement
    iterations: 50,
    simulateFailures: true
  },

  websocketTest: {
    name: 'WebSocket Test',
    description: 'Test WebSocket connection stability',
    methods: ['eth_subscribe'],
    expectedLatency: 1000,
    duration: 60000, // 1 minute
    subscriptions: ['newHeads', 'logs']
  }
};

/**
 * Rate limiting configurations for testing
 */
export const rateLimitConfigs = {
  conservative: {
    requestsPerSecond: 10,
    burstSize: 20,
    backoffMs: 1000
  },

  standard: {
    requestsPerSecond: 50,
    burstSize: 100,
    backoffMs: 500
  },

  aggressive: {
    requestsPerSecond: 200,
    burstSize: 500,
    backoffMs: 100
  },

  stress: {
    requestsPerSecond: 1000,
    burstSize: 2000,
    backoffMs: 50
  }
};

/**
 * Get testnet configuration by name
 */
export function getTestnetConfig(network: keyof typeof testnetConfigs): RpcTestConfig {
  const config = testnetConfigs[network];
  if (!config) {
    throw new Error(`Unknown testnet configuration: ${network}`);
  }
  return { ...config };
}

/**
 * Get mock configuration by name
 */
export function getMockConfig(name: keyof typeof mockConfigs): MockRpcConfig {
  const config = mockConfigs[name];
  if (!config) {
    throw new Error(`Unknown mock configuration: ${name}`);
  }
  return { ...config };
}

/**
 * Get health simulation configuration by name
 */
export function getHealthSimulation(scenario: keyof typeof healthSimulations): HealthSimulationConfig {
  const config = healthSimulations[scenario];
  if (!config) {
    throw new Error(`Unknown health simulation: ${scenario}`);
  }
  return { ...config };
}

/**
 * Get chain-specific configuration
 */
export function getChainConfig(chainId: number) {
  const config = chainConfigs[chainId];
  if (!config) {
    throw new Error(`Unknown chain configuration: ${chainId}`);
  }
  return { ...config };
}

/**
 * Get recommended provider for chain and test type
 */
export function getRecommendedProvider(
  chainId: number,
  testType: 'unit' | 'integration' | 'e2e' | 'load'
): { network: string; provider: string } {
  const chainConfig = getChainConfig(chainId);
  
  // For unit tests, use mock providers
  if (testType === 'unit') {
    return { network: 'mock', provider: 'fastLocal' };
  }

  // For integration and e2e tests, use testnet
  const testnetNetwork = chainConfig.testnet;
  
  // Choose provider based on test type
  const provider = testType === 'load' ? 'quicknode' : 'alchemy';
  
  return { network: testnetNetwork, provider };
}

/**
 * Create test-specific RPC configuration
 */
export function createTestRpcConfig(
  chainId: number,
  testType: 'unit' | 'integration' | 'e2e' | 'load',
  customizations: {
    timeout?: number;
    retries?: number;
    latency?: number;
    successRate?: number;
  } = {}
): RpcTestConfig | MockRpcConfig {
  const { network, provider } = getRecommendedProvider(chainId, testType);
  
  if (network === 'mock') {
    const baseConfig = getMockConfig(provider as keyof typeof mockConfigs);
    return {
      ...baseConfig,
      chainId,
      latencyMs: customizations.latency || baseConfig.latencyMs,
      successRate: customizations.successRate || baseConfig.successRate
    };
  }

  const baseConfig = getTestnetConfig(network as keyof typeof testnetConfigs);
  return {
    ...baseConfig,
    chainId,
    performance: {
      ...baseConfig.performance,
      timeoutMs: customizations.timeout || baseConfig.performance.timeoutMs,
      retries: customizations.retries || baseConfig.performance.retries,
      expectedLatencyMs: customizations.latency || baseConfig.performance.expectedLatencyMs
    }
  };
}

/**
 * Get test scenario configuration
 */
export function getTestScenario(name: keyof typeof testScenarios) {
  const scenario = testScenarios[name];
  if (!scenario) {
    throw new Error(`Unknown test scenario: ${name}`);
  }
  return { ...scenario };
}

/**
 * Get rate limiting configuration
 */
export function getRateLimitConfig(level: keyof typeof rateLimitConfigs) {
  const config = rateLimitConfigs[level];
  if (!config) {
    throw new Error(`Unknown rate limit configuration: ${level}`);
  }
  return { ...config };
}

/**
 * Validate RPC configuration
 */
export function validateRpcConfig(config: RpcTestConfig | MockRpcConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.chainId || config.chainId <= 0) {
    errors.push('Valid chain ID is required');
  }

  if ('providers' in config) {
    // Testnet configuration validation
    const testnetConfig = config as RpcTestConfig;
    
    if (!testnetConfig.providers.quicknode?.http) {
      errors.push('QuickNode HTTP endpoint is required');
    }
    
    if (!testnetConfig.providers.alchemy?.http) {
      errors.push('Alchemy HTTP endpoint is required');
    }
    
    if (!testnetConfig.providers.infura?.http) {
      errors.push('Infura HTTP endpoint is required');
    }
    
    if (testnetConfig.performance.timeoutMs <= 0) {
      errors.push('Timeout must be positive');
    }
    
    if (testnetConfig.performance.retries < 0) {
      errors.push('Retries must be non-negative');
    }
  } else {
    // Mock configuration validation
    const mockConfig = config as MockRpcConfig;
    
    if (!mockConfig.responses || mockConfig.responses.size === 0) {
      errors.push('Mock responses are required');
    }
    
    if (mockConfig.latencyMs < 0) {
      errors.push('Latency must be non-negative');
    }
    
    if (mockConfig.successRate < 0 || mockConfig.successRate > 1) {
      errors.push('Success rate must be between 0 and 1');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get all supported chain IDs for testing
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(chainConfigs).map(Number);
}

/**
 * Get all available testnet networks
 */
export function getAvailableTestnets(): string[] {
  return Object.keys(testnetConfigs);
}

/**
 * Get all available mock configurations
 */
export function getAvailableMockConfigs(): string[] {
  return Object.keys(mockConfigs);
}

/**
 * Get all available health simulations
 */
export function getAvailableHealthSimulations(): string[] {
  return Object.keys(healthSimulations);
}

/**
 * Create comprehensive test configuration for all chains
 */
export function createMultiChainTestConfig(
  testType: 'unit' | 'integration' | 'e2e' | 'load',
  chainIds: number[] = getSupportedChainIds()
): Record<number, RpcTestConfig | MockRpcConfig> {
  const configs: Record<number, RpcTestConfig | MockRpcConfig> = {};
  
  for (const chainId of chainIds) {
    configs[chainId] = createTestRpcConfig(chainId, testType);
  }
  
  return configs;
}

/**
 * Performance targets for MEV trading
 */
export const mevPerformanceTargets = {
  maxLatency: 350, // MEV requirement: sub-350ms
  maxFailoverTime: 100, // Fast failover for MEV
  minSuccessRate: 0.995, // High reliability requirement
  maxJitter: 50 // Low jitter for consistent performance
};

/**
 * Check if configuration meets MEV performance requirements
 */
export function validateMevPerformance(
  config: RpcTestConfig,
  testResults?: { avgLatency: number; successRate: number; jitter: number }
): { meetsRequirements: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check configuration
  if (config.performance.expectedLatencyMs > mevPerformanceTargets.maxLatency) {
    issues.push(`Expected latency ${config.performance.expectedLatencyMs}ms exceeds MEV target ${mevPerformanceTargets.maxLatency}ms`);
  }

  if (config.performance.timeoutMs > mevPerformanceTargets.maxLatency * 2) {
    issues.push(`Timeout ${config.performance.timeoutMs}ms is too high for MEV requirements`);
  }

  // Check test results if provided
  if (testResults) {
    if (testResults.avgLatency > mevPerformanceTargets.maxLatency) {
      issues.push(`Average latency ${testResults.avgLatency}ms exceeds MEV target`);
    }

    if (testResults.successRate < mevPerformanceTargets.minSuccessRate) {
      issues.push(`Success rate ${testResults.successRate} below MEV target ${mevPerformanceTargets.minSuccessRate}`);
    }

    if (testResults.jitter > mevPerformanceTargets.maxJitter) {
      issues.push(`Jitter ${testResults.jitter}ms exceeds MEV target ${mevPerformanceTargets.maxJitter}ms`);
    }
  }

  return {
    meetsRequirements: issues.length === 0,
    issues
  };
}
