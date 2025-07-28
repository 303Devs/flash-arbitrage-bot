/**
 * 🌍 Test Environment Management
 * 
 * Enterprise-grade test environment setup and management utilities.
 * Provides isolated test environments with comprehensive performance monitoring.
 * 
 * @fileoverview Test environment management for MEV arbitrage bot
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { TestDatabases, TestDatabaseInstance } from './TestDatabases';
import { TestRpcProviders, TestRpcInstance } from './TestRpcProviders';
import { WebSocketTestInfra, TestWebSocketManager } from './MockWebSockets';
import { Logger } from '@utils/Logger';

/**
 * Test environment configuration
 */
export interface TestEnvironmentConfig {
  testName: string;
  isolationLevel: 'unit' | 'integration' | 'e2e';
  enableRealRpc: boolean;
  enableRealWebSockets: boolean;
  enableRealDatabases: boolean;
  chainIds: number[];
  performance: {
    timeoutMs: number;
    maxMemoryMB: number;
    maxCpuPercent: number;
  };
  cleanup: {
    autoCleanup: boolean;
    cleanupTimeoutMs: number;
  };
}

/**
 * Complete test environment instance
 */
export interface TestEnvInstance {
  testId: string;
  config: TestEnvironmentConfig;
  databases: TestDatabaseInstance | null;
  rpcProviders: Map<number, TestRpcInstance>;
  webSocketManagers: Map<number, TestWebSocketManager>;
  performance: PerformanceMonitor;
  cleanup: () => Promise<void>;
  startTime: Date;
}

/**
 * Performance monitoring for test execution
 */
export interface PerformanceMetrics {
  testId: string;
  executionTimeMs: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
  databaseOperations: number;
  rpcCalls: number;
  webSocketMessages: number;
  errors: string[];
  timestamp: Date;
}

/**
 * Test execution summary
 */
export interface TestExecutionSummary {
  testId: string;
  testName: string;
  status: 'passed' | 'failed' | 'timeout' | 'error';
  executionTimeMs: number;
  performance: PerformanceMetrics;
  resourceUsage: {
    peakMemoryMB: number;
    avgCpuPercent: number;
    dbConnections: number;
    rpcConnections: number;
    wsConnections: number;
  };
  errors: string[];
  warnings: string[];
}

/**
 * Performance Monitor
 * 
 * Monitors test execution performance and resource usage
 */
export class PerformanceMonitor {
  private readonly logger = Logger.getInstance();
  private testId: string;
  private startTime: number;
  private metrics: PerformanceMetrics;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private samples: PerformanceMetrics[] = [];

  constructor(testId: string) {
    this.testId = testId;
    this.startTime = Date.now();
    this.metrics = {
      testId,
      executionTimeMs: 0,
      memoryUsageMB: 0,
      cpuUsagePercent: 0,
      databaseOperations: 0,
      rpcCalls: 0,
      webSocketMessages: 0,
      errors: [],
      timestamp: new Date()
    };
  }

  /**
   * Start performance monitoring
   */
  public start(): void {
    this.logger.debug('Starting performance monitoring', { testId: this.testId });

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 1000); // Collect metrics every second
  }

  /**
   * Stop performance monitoring
   */
  public stop(): PerformanceMetrics {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.metrics.executionTimeMs = Date.now() - this.startTime;
    this.metrics.timestamp = new Date();

    this.logger.debug('Performance monitoring stopped', { 
      testId: this.testId,
      executionTimeMs: this.metrics.executionTimeMs,
      peakMemoryMB: this.getPeakMemoryUsage(),
      avgCpuPercent: this.getAverageCpuUsage()
    });

    return this.metrics;
  }

  /**
   * Collect current performance metrics
   */
  private collectMetrics(): void {
    const memoryUsage = process.memoryUsage();
    
    const currentMetrics: PerformanceMetrics = {
      testId: this.testId,
      executionTimeMs: Date.now() - this.startTime,
      memoryUsageMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      cpuUsagePercent: this.getCpuUsage(),
      databaseOperations: this.metrics.databaseOperations,
      rpcCalls: this.metrics.rpcCalls,
      webSocketMessages: this.metrics.webSocketMessages,
      errors: [...this.metrics.errors],
      timestamp: new Date()
    };

    this.samples.push(currentMetrics);
    this.metrics = currentMetrics;

    // Keep only last 60 samples (1 minute of data)
    if (this.samples.length > 60) {
      this.samples.shift();
    }
  }

  /**
   * Get CPU usage (simplified)
   */
  private getCpuUsage(): number {
    // Simplified CPU usage calculation
    const cpuUsage = process.cpuUsage();
    return Math.round((cpuUsage.user + cpuUsage.system) / 1000000 * 100);
  }

  /**
   * Get peak memory usage
   */
  public getPeakMemoryUsage(): number {
    return this.samples.length > 0 
      ? Math.max(...this.samples.map(s => s.memoryUsageMB))
      : this.metrics.memoryUsageMB;
  }

  /**
   * Get average CPU usage
   */
  public getAverageCpuUsage(): number {
    return this.samples.length > 0
      ? this.samples.reduce((sum, s) => sum + s.cpuUsagePercent, 0) / this.samples.length
      : this.metrics.cpuUsagePercent;
  }

  /**
   * Increment operation counters
   */
  public incrementDatabaseOperations(): void {
    this.metrics.databaseOperations++;
  }

  public incrementRpcCalls(): void {
    this.metrics.rpcCalls++;
  }

  public incrementWebSocketMessages(): void {
    this.metrics.webSocketMessages++;
  }

  /**
   * Add error
   */
  public addError(error: string): void {
    this.metrics.errors.push(error);
  }

  /**
   * Get current metrics
   */
  public getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if performance thresholds are exceeded
   */
  public checkThresholds(config: TestEnvironmentConfig): { exceeded: boolean; violations: string[] } {
    const violations: string[] = [];

    if (this.metrics.memoryUsageMB > config.performance.maxMemoryMB) {
      violations.push(`Memory usage ${this.metrics.memoryUsageMB}MB exceeds limit ${config.performance.maxMemoryMB}MB`);
    }

    if (this.metrics.cpuUsagePercent > config.performance.maxCpuPercent) {
      violations.push(`CPU usage ${this.metrics.cpuUsagePercent}% exceeds limit ${config.performance.maxCpuPercent}%`);
    }

    if (this.metrics.executionTimeMs > config.performance.timeoutMs) {
      violations.push(`Execution time ${this.metrics.executionTimeMs}ms exceeds timeout ${config.performance.timeoutMs}ms`);
    }

    return {
      exceeded: violations.length > 0,
      violations
    };
  }
}

/**
 * Enterprise Test Environment Management
 * 
 * Provides comprehensive test environment setup and management
 */
export class TestEnvironment {
  private static readonly logger = Logger.getInstance();
  private static activeEnvironments = new Map<string, TestEnvInstance>();
  private static instanceCounter = 0;

  /**
   * Default test environment configurations
   */
  private static readonly DEFAULT_CONFIGS: Record<string, Partial<TestEnvironmentConfig>> = {
    unit: {
      isolationLevel: 'unit',
      enableRealRpc: false,
      enableRealWebSockets: false,
      enableRealDatabases: true, // Use real databases for better testing
      chainIds: [42161], // Arbitrum only
      performance: {
        timeoutMs: 10000, // 10 seconds
        maxMemoryMB: 256,
        maxCpuPercent: 50
      },
      cleanup: {
        autoCleanup: true,
        cleanupTimeoutMs: 5000
      }
    },
    integration: {
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
    },
    e2e: {
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
    }
  };

  /**
   * Setup test environment with comprehensive infrastructure
   */
  public static async setupTestEnvironment(
    testName: string,
    configOverrides: Partial<TestEnvironmentConfig> = {}
  ): Promise<TestEnvInstance> {
    const testId = `${testName}_${++this.instanceCounter}_${Date.now()}`;
    const startTime = Date.now();

    this.logger.info('Setting up test environment', { testId, testName });

    // Determine configuration
    const baseConfig = this.getBaseConfig(testName);
    const config: TestEnvironmentConfig = {
      testName,
      ...baseConfig,
      ...configOverrides
    };

    try {
      // Initialize performance monitoring
      const performance = new PerformanceMonitor(testId);
      performance.start();

      // Setup databases if enabled
      let databases: TestDatabaseInstance | null = null;
      if (config.enableRealDatabases) {
        this.logger.debug('Setting up test databases', { testId });
        databases = await TestDatabases.setupTestEnvironment(testName);
        performance.incrementDatabaseOperations();
      }

      // Setup RPC providers
      const rpcProviders = new Map<number, TestRpcInstance>();
      if (config.enableRealRpc) {
        this.logger.debug('Setting up RPC providers', { testId, chainIds: config.chainIds });
        
        for (const chainId of config.chainIds) {
          try {
            const rpcInstance = await TestRpcProviders.getTestnetProviders(
              `${testName}_chain_${chainId}`,
              chainId === 11155111 ? 'sepolia' : 'mumbai',
              'quicknode'
            );
            rpcProviders.set(chainId, rpcInstance);
            performance.incrementRpcCalls();
          } catch (error) {
            this.logger.warn('Failed to setup RPC provider for chain', { 
              testId, 
              chainId, 
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      // Setup WebSocket managers
      const webSocketManagers = new Map<number, TestWebSocketManager>();
      if (config.enableRealWebSockets) {
        this.logger.debug('Setting up WebSocket managers', { testId, chainIds: config.chainIds });
        
        for (const chainId of config.chainIds) {
          try {
            const wsManager = WebSocketTestInfra.createTestWebSocket(
              `${testName}_ws_${chainId}`,
              chainId,
              true // Use testnet
            );
            webSocketManagers.set(chainId, wsManager);
            performance.incrementWebSocketMessages();
          } catch (error) {
            this.logger.warn('Failed to setup WebSocket manager for chain', {
              testId,
              chainId,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }

      // Create cleanup function
      const cleanup = async () => {
        await this.cleanupTestEnvironment(testId, databases, rpcProviders, webSocketManagers, performance);
      };

      // Create test environment instance
      const instance: TestEnvInstance = {
        testId,
        config,
        databases,
        rpcProviders,
        webSocketManagers,
        performance,
        cleanup,
        startTime: new Date()
      };

      // Track active environment
      this.activeEnvironments.set(testId, instance);

      const setupTime = Date.now() - startTime;
      this.logger.info('Test environment ready', {
        testId,
        setupTimeMs: setupTime,
        isolationLevel: config.isolationLevel,
        chainsEnabled: config.chainIds.length,
        databasesEnabled: config.enableRealDatabases,
        rpcEnabled: config.enableRealRpc,
        webSocketsEnabled: config.enableRealWebSockets
      });

      return instance;

    } catch (error) {
      this.logger.error('Failed to setup test environment', { testId, testName, error });
      throw new Error(`Test environment setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get base configuration for test type
   */
  private static getBaseConfig(testName: string): Partial<TestEnvironmentConfig> {
    // Determine test type from name patterns
    if (testName.includes('unit') || testName.includes('Unit')) {
      return this.DEFAULT_CONFIGS.unit;
    } else if (testName.includes('integration') || testName.includes('Integration')) {
      return this.DEFAULT_CONFIGS.integration;
    } else if (testName.includes('e2e') || testName.includes('E2E') || testName.includes('end-to-end')) {
      return this.DEFAULT_CONFIGS.e2e;
    }

    // Default to integration for comprehensive testing
    return this.DEFAULT_CONFIGS.integration;
  }

  /**
   * Cleanup test environment instance
   */
  private static async cleanupTestEnvironment(
    testId: string,
    databases: TestDatabaseInstance | null,
    rpcProviders: Map<number, TestRpcInstance>,
    webSocketManagers: Map<number, TestWebSocketManager>,
    performance: PerformanceMonitor
  ): Promise<void> {
    const startTime = Date.now();
    
    this.logger.debug('Cleaning up test environment', { testId });

    try {
      // Stop performance monitoring
      performance.stop();

      // Cleanup WebSocket managers
      for (const [chainId, wsManager] of webSocketManagers) {
        try {
          await wsManager.disconnect();
        } catch (error) {
          this.logger.warn('Failed to cleanup WebSocket manager', { testId, chainId, error });
        }
      }

      // Cleanup RPC providers
      for (const [chainId, rpcInstance] of rpcProviders) {
        try {
          await rpcInstance.cleanup();
        } catch (error) {
          this.logger.warn('Failed to cleanup RPC provider', { testId, chainId, error });
        }
      }

      // Cleanup databases
      if (databases) {
        try {
          await databases.cleanup();
        } catch (error) {
          this.logger.warn('Failed to cleanup databases', { testId, error });
        }
      }

      // Remove from active environments
      this.activeEnvironments.delete(testId);

      const cleanupTime = Date.now() - startTime;
      this.logger.debug('Test environment cleanup complete', { testId, cleanupTimeMs: cleanupTime });

    } catch (error) {
      this.logger.error('Test environment cleanup failed', { testId, error });
      // Don't throw - cleanup should be best effort
    }
  }

  /**
   * Measure test performance
   */
  public static async measureTestPerformance<T>(
    testId: string,
    testFunction: () => Promise<T>
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    const instance = this.activeEnvironments.get(testId);
    if (!instance) {
      throw new Error(`Test environment not found: ${testId}`);
    }

    this.logger.debug('Starting performance measurement', { testId });

    const startTime = Date.now();
    let result: T;
    let error: Error | null = null;

    try {
      result = await testFunction();
    } catch (err) {
      error = err instanceof Error ? err : new Error('Unknown error');
      instance.performance.addError(error.message);
      throw error;
    } finally {
      const executionTime = Date.now() - startTime;
      this.logger.debug('Performance measurement complete', { 
        testId, 
        executionTimeMs: executionTime,
        success: !error
      });
    }

    const metrics = instance.performance.getCurrentMetrics();
    return { result, metrics };
  }

  /**
   * Execute test with comprehensive monitoring
   */
  public static async executeTest<T>(
    testName: string,
    testFunction: (env: TestEnvInstance) => Promise<T>,
    configOverrides: Partial<TestEnvironmentConfig> = {}
  ): Promise<TestExecutionSummary> {
    let testInstance: TestEnvInstance | null = null;
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Setup test environment
      testInstance = await this.setupTestEnvironment(testName, configOverrides);

      this.logger.info('Executing test', { 
        testId: testInstance.testId, 
        testName,
        isolationLevel: testInstance.config.isolationLevel
      });

      // Execute test function
      const { result, metrics } = await this.measureTestPerformance(
        testInstance.testId,
        () => testFunction(testInstance!)
      );

      // Check performance thresholds
      const thresholds = testInstance.performance.checkThresholds(testInstance.config);
      if (thresholds.exceeded) {
        warnings.push(...thresholds.violations);
      }

      const executionTime = Date.now() - startTime;

      const summary: TestExecutionSummary = {
        testId: testInstance.testId,
        testName,
        status: 'passed',
        executionTimeMs: executionTime,
        performance: metrics,
        resourceUsage: {
          peakMemoryMB: testInstance.performance.getPeakMemoryUsage(),
          avgCpuPercent: testInstance.performance.getAverageCpuUsage(),
          dbConnections: testInstance.databases ? 1 : 0,
          rpcConnections: testInstance.rpcProviders.size,
          wsConnections: testInstance.webSocketManagers.size
        },
        errors,
        warnings
      };

      this.logger.info('Test execution completed successfully', summary);

      return summary;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);

      const summary: TestExecutionSummary = {
        testId: testInstance?.testId || 'unknown',
        testName,
        status: executionTime > (configOverrides.performance?.timeoutMs || 30000) ? 'timeout' : 'failed',
        executionTimeMs: executionTime,
        performance: testInstance?.performance.getCurrentMetrics() || {
          testId: 'unknown',
          executionTimeMs: executionTime,
          memoryUsageMB: 0,
          cpuUsagePercent: 0,
          databaseOperations: 0,
          rpcCalls: 0,
          webSocketMessages: 0,
          errors: [errorMessage],
          timestamp: new Date()
        },
        resourceUsage: {
          peakMemoryMB: testInstance?.performance.getPeakMemoryUsage() || 0,
          avgCpuPercent: testInstance?.performance.getAverageCpuUsage() || 0,
          dbConnections: testInstance?.databases ? 1 : 0,
          rpcConnections: testInstance?.rpcProviders.size || 0,
          wsConnections: testInstance?.webSocketManagers.size || 0
        },
        errors,
        warnings
      };

      this.logger.error('Test execution failed', summary);

      return summary;

    } finally {
      // Cleanup test environment
      if (testInstance && testInstance.config.cleanup.autoCleanup) {
        try {
          await testInstance.cleanup();
        } catch (cleanupError) {
          this.logger.error('Test cleanup failed', { 
            testId: testInstance.testId,
            error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
          });
        }
      }
    }
  }

  /**
   * Cleanup all active test environments
   */
  public static async cleanupAllEnvironments(): Promise<void> {
    this.logger.info('Cleaning up all test environments', { 
      activeCount: this.activeEnvironments.size 
    });

    const cleanupPromises = Array.from(this.activeEnvironments.values()).map(instance => 
      instance.cleanup().catch(error => 
        this.logger.error('Failed to cleanup test environment', { testId: instance.testId, error })
      )
    );

    await Promise.all(cleanupPromises);
    this.activeEnvironments.clear();

    this.logger.info('All test environments cleaned up');
  }

  /**
   * Get active environment count
   */
  public static getActiveEnvironmentCount(): number {
    return this.activeEnvironments.size;
  }

  /**
   * Get test environment by ID
   */
  public static getTestEnvironment(testId: string): TestEnvInstance | undefined {
    return this.activeEnvironments.get(testId);
  }

  /**
   * Create custom test configuration
   */
  public static createCustomConfig(
    isolationLevel: 'unit' | 'integration' | 'e2e',
    overrides: Partial<TestEnvironmentConfig> = {}
  ): TestEnvironmentConfig {
    const baseConfig = this.DEFAULT_CONFIGS[isolationLevel];
    
    return {
      testName: 'custom',
      isolationLevel,
      enableRealRpc: baseConfig.enableRealRpc || false,
      enableRealWebSockets: baseConfig.enableRealWebSockets || false,
      enableRealDatabases: baseConfig.enableRealDatabases || false,
      chainIds: baseConfig.chainIds || [42161],
      performance: {
        timeoutMs: baseConfig.performance?.timeoutMs || 30000,
        maxMemoryMB: baseConfig.performance?.maxMemoryMB || 512,
        maxCpuPercent: baseConfig.performance?.maxCpuPercent || 75
      },
      cleanup: {
        autoCleanup: baseConfig.cleanup?.autoCleanup || true,
        cleanupTimeoutMs: baseConfig.cleanup?.cleanupTimeoutMs || 10000
      },
      ...overrides
    };
  }

  /**
   * Verify test environment health
   */
  public static async verifyEnvironmentHealth(instance: TestEnvInstance): Promise<{
    healthy: boolean;
    checks: Record<string, boolean>;
    issues: string[];
  }> {
    const checks: Record<string, boolean> = {};
    const issues: string[] = [];

    this.logger.debug('Verifying test environment health', { testId: instance.testId });

    // Check database connectivity
    if (instance.databases) {
      try {
        checks.databases = await TestDatabases.verifyConnectivity(instance.databases);
        if (!checks.databases) {
          issues.push('Database connectivity failed');
        }
      } catch (error) {
        checks.databases = false;
        issues.push(`Database check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      checks.databases = true; // Not required
    }

    // Check RPC provider connectivity
    let rpcHealthy = true;
    for (const [chainId, rpcInstance] of instance.rpcProviders) {
      try {
        const healthy = await TestRpcProviders.verifyConnectivity(rpcInstance);
        checks[`rpc_${chainId}`] = healthy;
        if (!healthy) {
          rpcHealthy = false;
          issues.push(`RPC provider ${chainId} connectivity failed`);
        }
      } catch (error) {
        checks[`rpc_${chainId}`] = false;
        rpcHealthy = false;
        issues.push(`RPC provider ${chainId} check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    checks.rpcProviders = rpcHealthy;

    // Check WebSocket connectivity
    let wsHealthy = true;
    for (const [chainId, wsManager] of instance.webSocketManagers) {
      const connected = wsManager.isConnected();
      checks[`websocket_${chainId}`] = connected;
      if (!connected) {
        wsHealthy = false;
        issues.push(`WebSocket ${chainId} not connected`);
      }
    }
    checks.webSockets = wsHealthy;

    // Check performance metrics
    const performanceCheck = instance.performance.checkThresholds(instance.config);
    checks.performance = !performanceCheck.exceeded;
    if (performanceCheck.exceeded) {
      issues.push(...performanceCheck.violations);
    }

    const healthy = Object.values(checks).every(check => check);

    this.logger.debug('Test environment health check complete', {
      testId: instance.testId,
      healthy,
      checksCount: Object.keys(checks).length,
      issuesCount: issues.length
    });

    return { healthy, checks, issues };
  }

  /**
   * Get default configurations
   */
  public static getDefaultConfigurations(): Record<string, Partial<TestEnvironmentConfig>> {
    return { ...this.DEFAULT_CONFIGS };
  }

  /**
   * Get test environment statistics
   */
  public static getEnvironmentStatistics(): {
    active: number;
    totalCreated: number;
    byIsolationLevel: Record<string, number>;
    avgSetupTime: number;
  } {
    const active = this.activeEnvironments.size;
    const totalCreated = this.instanceCounter;
    
    const byIsolationLevel: Record<string, number> = {};
    for (const instance of this.activeEnvironments.values()) {
      const level = instance.config.isolationLevel;
      byIsolationLevel[level] = (byIsolationLevel[level] || 0) + 1;
    }

    return {
      active,
      totalCreated,
      byIsolationLevel,
      avgSetupTime: 0 // This could be calculated from historical data
    };
  }
}

/**
 * Test Environment Utilities
 */
export class TestEnvironmentUtils {
  private static readonly logger = Logger.getInstance();

  /**
   * Wait for environment to be ready
   */
  public static async waitForEnvironmentReady(
    instance: TestEnvInstance,
    timeoutMs: number = 30000
  ): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const health = await TestEnvironment.verifyEnvironmentHealth(instance);
      if (health.healthy) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return false;
  }

  /**
   * Create test data seeds
   */
  public static async seedTestData(instance: TestEnvInstance): Promise<void> {
    this.logger.debug('Seeding test data', { testId: instance.testId });

    if (instance.databases) {
      // Seed database test data
      const testSchema = `test_${instance.testId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
      
      for (const chainId of instance.config.chainIds) {
        // Seed provider health data
        await TestDatabases.seedProviderHealthData(
          instance.databases.postgres,
          testSchema,
          chainId,
          'test_provider'
        );

        // Seed circuit breaker data
        await TestDatabases.seedCircuitBreakerData(
          instance.databases.postgres,
          testSchema,
          chainId,
          'test_provider'
        );
      }

      // Seed Redis price data
      await TestDatabases.seedRedisPriceData(instance.databases.redis);
    }

    this.logger.debug('Test data seeding complete', { testId: instance.testId });
  }

  /**
   * Generate load testing data
   */
  public static generateLoadTestData(recordCount: number): any[] {
    const data = [];
    const now = Date.now();

    for (let i = 0; i < recordCount; i++) {
      data.push({
        id: i,
        timestamp: new Date(now - (recordCount - i) * 1000),
        value: Math.random() * 1000,
        chainId: [42161, 137, 8453][i % 3],
        provider: ['quicknode', 'alchemy', 'infura'][i % 3]
      });
    }

    return data;
  }

  /**
   * Simulate network latency
   */
  public static async simulateNetworkLatency(latencyMs: number): Promise<void> {
    if (latencyMs > 0) {
      await new Promise(resolve => setTimeout(resolve, latencyMs));
    }
  }

  /**
   * Create memory pressure for testing
   */
  public static createMemoryPressure(sizeMB: number): Buffer {
    const size = sizeMB * 1024 * 1024;
    return Buffer.alloc(size, 'test data for memory pressure simulation');
  }

  /**
   * Validate test configuration
   */
  public static validateTestConfig(config: TestEnvironmentConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.testName || config.testName.trim().length === 0) {
      errors.push('Test name is required');
    }

    if (!['unit', 'integration', 'e2e'].includes(config.isolationLevel)) {
      errors.push('Invalid isolation level');
    }

    if (config.chainIds.length === 0) {
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

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
