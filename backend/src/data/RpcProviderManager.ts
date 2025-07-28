import { createPublicClient, createWalletClient, http, webSocket, PublicClient, WalletClient, Chain } from 'viem';
import { privateKeyToAccount, PrivateKeyAccount } from 'viem/accounts';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/Logger.js';
import { redisCache } from '../storage/RedisCache.js';
// Remove circular dependencies - will be injected during initialization
// import { connectionHealthMonitor } from './ConnectionHealthMonitor.js';
// import { providerFailoverLogic } from './ProviderFailoverLogic.js';

// Import types only to avoid circular dependencies
import type { ConnectionHealthMonitor } from './ConnectionHealthMonitor.js';
import type { ProviderFailoverLogic } from './ProviderFailoverLogic.js';

// Type definitions for provider configuration
export interface RpcProviderConfig {
  name: string;
  websocket: string;
  http: string;
  priority: number;
  maxRetries: number;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcProviders: {
    primary: RpcProviderConfig;
    fallback: RpcProviderConfig[];
  };
  performance: {
    averageBlockTime: number;
    confirmationsRequired: number;
    maxBlocksToWait: number;
    rpcTimeout: number;
    retryBackoff: number[];
  };
}

export interface ProviderInstance {
  name: string;
  priority: number;
  publicClient: PublicClient;
  walletClient: WalletClient;
  webSocketClient: PublicClient;
  isHealthy: boolean;
  lastHealthCheck: number;
  consecutiveFailures: number;
  responseTime: number;
}

export interface ProviderStats {
  name: string;
  priority: number;
  isHealthy: boolean;
  consecutiveFailures: number;
  responseTime: number;
  lastHealthCheck: number;
  successRate: number;
  totalRequests: number;
  successfulRequests: number;
}

export interface ConnectionStats {
  chainId: number;
  chainName: string;
  totalProviders: number;
  healthyProviders: number;
  currentProvider: string;
  averageResponseTime: number;
  totalRequests: number;
  successfulRequests: number;
  successRate: number;
}

/**
 * RPC Provider Manager - Central orchestrator for all blockchain connections
 * 
 * This is the CRITICAL INFRASTRUCTURE layer that manages multiple RPC providers
 * per chain with automatic failover, health monitoring, and performance optimization.
 * 
 * Features:
 * - Manages QuickNode → Alchemy → Infura failover sequence per chain
 * - Maintains connection pools for both WebSocket and HTTP connections
 * - Provides unified interface for all blockchain interactions
 * - Tracks connection health and performance metrics
 * - Integrates with Redis for caching and PostgreSQL for logging
 */
export class RpcProviderManager {
  private chains: Map<number, ChainConfig> = new Map();
  private providers: Map<number, ProviderInstance[]> = new Map();
  private currentProviders: Map<number, ProviderInstance> = new Map();
  private isInitialized: boolean = false;
  private account: PrivateKeyAccount;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  // Dynamic chain mappings - NO HARDCODED VALUES
  private chainMappings: Map<number, Chain> = new Map();
  
  // Phase 2 enhancements
  private isAdvancedMonitoringEnabled: boolean = false;
  private healthMonitor?: ConnectionHealthMonitor;
  private failoverLogic?: ProviderFailoverLogic;

  constructor() {
    // Validate critical environment variables early
    this.validateEnvironmentVariables();
    this.account = this.setupAccount();
  }

  /**
   * Validate critical environment variables
   */
  private validateEnvironmentVariables(): void {
    const requiredEnvVars = ['PRIVATE_KEY'];
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`${envVar} environment variable is required`);
      }
    }
  }

  /**
   * Initialize the RPC Provider Manager
   * Loads chain configurations and sets up all provider instances
   */
  async initialize(): Promise<void> {
    try {
      logger.startup('Initializing RPC Provider Manager...');
      
      // Ensure Redis is connected before we start caching health data
      await this.ensureRedisConnection();
      
      // Load chain configurations and build dynamic chain mappings
      await this.loadChainConfigurations();
      
      // Create provider instances for all chains
      await this.createProviderInstances();
      
      // Perform initial health checks
      await this.performInitialHealthChecks();
      
      // Create health monitoring database tables
      await this.createHealthMonitoringTables();
      
      // Initialize Phase 2 components
      await this.initializeAdvancedMonitoring();
      
      // Start continuous health monitoring
      this.startHealthMonitoring();
      
      this.isInitialized = true;
      logger.startup('RPC Provider Manager initialized successfully', {
        chainsLoaded: this.chains.size,
        totalProviders: Array.from(this.providers.values()).reduce((sum, providers) => sum + providers.length, 0)
      });
    } catch (error) {
      logger.error('Failed to initialize RPC Provider Manager', error instanceof Error ? error : new Error(String(error)));
      throw new Error(`RPC Provider Manager initialization failed: ${error}`);
    }
  }

  /**
   * Create health monitoring database tables
   */
  private async createHealthMonitoringTables(): Promise<void> {
    try {
      logger.startup('Creating health monitoring database tables...');
      
      // Import PostgreSQL repository dynamically
      const { postgresRepository } = await import('../storage/PostgresRepository.js');
      
      // Create health monitoring tables
      await postgresRepository.createHealthMonitoringTables();
      
      logger.startup('Health monitoring database tables created successfully');
    } catch (error) {
      logger.error('Failed to create health monitoring tables', error instanceof Error ? error : new Error(String(error)));
      // Don't throw - this is not critical for basic functionality
      logger.warn('Continuing without health monitoring tables');
    }
  }

  /**
   * Initialize advanced monitoring components (Phase 2)
   */
  private async initializeAdvancedMonitoring(): Promise<void> {
    try {
      logger.startup('Initializing advanced monitoring components...');
      
      // Prepare provider configurations for advanced components
      const providerConfigs: Array<{
        name: string;
        chainId: number;
        priority: number;
      }> = [];
      
      for (const [chainId, providers] of this.providers) {
        for (const provider of providers) {
          providerConfigs.push({
            name: provider.name,
            chainId: chainId,
            priority: provider.priority
          });
        }
      }
      
      // Dynamically import to avoid circular dependencies
      const { connectionHealthMonitor } = await import('./ConnectionHealthMonitor.js');
      const { providerFailoverLogic } = await import('./ProviderFailoverLogic.js');
      
      // Store references for later use
      this.healthMonitor = connectionHealthMonitor;
      this.failoverLogic = providerFailoverLogic;
      
      // Initialize Connection Health Monitor
      await connectionHealthMonitor.initialize(providerConfigs);
      logger.startup('Connection Health Monitor initialized');
      
      // Initialize Provider Failover Logic
      await providerFailoverLogic.initialize(providerConfigs);
      logger.startup('Provider Failover Logic initialized');
      
      // Set up event listeners for integration
      this.setupAdvancedMonitoringListeners();
      
      this.isAdvancedMonitoringEnabled = true;
      logger.startup('Advanced monitoring components initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize advanced monitoring components', error instanceof Error ? error : new Error(String(error)));
      // Don't throw - basic functionality should still work
      logger.warn('Continuing with basic health monitoring only');
    }
  }
  
  /**
   * Set up event listeners for advanced monitoring integration
   */
  private setupAdvancedMonitoringListeners(): void {
    if (!this.failoverLogic) {
      logger.warn('Failover logic not available for event listeners');
      return;
    }
    
    // Listen for failover events
    this.failoverLogic.on('providerSwitched', (event) => {
      logger.info('Failover logic triggered provider switch', {
        chainId: event.chainId,
        fromProvider: event.fromProvider,
        toProvider: event.toProvider,
        reason: event.reason,
        switchLatency: event.switchLatency
      });
    });
    
    // Listen for circuit breaker events
    this.failoverLogic.on('circuitBreakerOpened', (event) => {
      logger.warn('Circuit breaker opened for provider', {
        chainId: event.chainId,
        provider: event.provider,
        failureCount: event.failureCount
      });
    });
    
    this.failoverLogic.on('circuitBreakerClosed', (event) => {
      logger.info('Circuit breaker closed - provider recovered', {
        chainId: event.chainId,
        provider: event.provider,
        recoveryDuration: event.recoveryDuration
      });
    });
    
    // Listen for operations alerts
    this.failoverLogic.on('operationsAlert', (event) => {
      logger.error('OPERATIONS ALERT from failover logic', {
        chainId: event.chainId,
        severity: event.severity,
        message: event.message,
        providerStates: event.providerStates
      });
    });
  }

  /**
   * Ensure Redis connection is established before health checks
   */
  private async ensureRedisConnection(): Promise<void> {
    try {
      if (!redisCache.isHealthy()) {
        logger.debug('Redis not connected, attempting connection...');
        await redisCache.connect();
        
        // Wait a moment for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!redisCache.isHealthy()) {
          logger.warn('Redis connection not healthy, health caching will be disabled');
        }
      }
    } catch (error) {
      logger.warn('Failed to ensure Redis connection, health caching will be disabled', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Load chain configurations from chains.json with environment variable resolution
   * Also builds dynamic chain mappings based on loaded configurations
   */
  private async loadChainConfigurations(): Promise<void> {
    try {
      const configPath = resolve(process.cwd(), 'backend/config/chains.json');
      const configData = readFileSync(configPath, 'utf8');
      const rawConfig = JSON.parse(configData) as Record<string, unknown>;

      for (const [chainIdStr, config] of Object.entries(rawConfig)) {
        const chainId = parseInt(chainIdStr);
        const resolvedConfig = this.resolveEnvironmentVariables(config);
        
        this.chains.set(chainId, resolvedConfig);
        
        // Build dynamic chain mapping based on chain ID - SIMPLIFIED
        const viemChain = this.createViemChainFromConfig(resolvedConfig);
        this.chainMappings.set(chainId, viemChain);
        
        logger.debug('Chain configuration loaded', { 
          chainId, 
          chainName: resolvedConfig.name,
          providersCount: 1 + resolvedConfig.rpcProviders.fallback.length
        });
      }

      logger.info('Chain configurations loaded successfully', { 
        chainsCount: this.chains.size,
        chainIds: Array.from(this.chains.keys())
      });
    } catch (error) {
      logger.error('Failed to load chain configurations', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Create viem Chain object from configuration - SIMPLIFIED, NO HARDCODED MAPPINGS
   */
  private createViemChainFromConfig(config: ChainConfig): Chain {
    return {
      id: config.chainId,
      name: config.name,
      nativeCurrency: config.nativeCurrency,
      rpcUrls: {
        default: {
          http: [config.rpcProviders.primary.http],
          webSocket: [config.rpcProviders.primary.websocket]
        }
      }
      // Removed block explorer complexity - not needed for trading functionality
    } as Chain;
  }

  /**
   * Resolve environment variables in configuration
   */
  private resolveEnvironmentVariables(config: unknown): ChainConfig {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid chain configuration structure');
    }

    const chainConfig = config as Record<string, unknown>;

    const resolveString = (str: string): string => {
      return str.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
        const value = process.env[envVar];
        if (!value) {
          throw new Error(`Environment variable ${envVar} is not set`);
        }
        return value;
      });
    };

    const resolveProvider = (provider: unknown): RpcProviderConfig => {
      if (!provider || typeof provider !== 'object') {
        throw new Error('Invalid provider configuration');
      }

      const providerConfig = provider as Record<string, unknown>;

      return {
        name: String(providerConfig.name),
        websocket: resolveString(String(providerConfig.websocket)),
        http: resolveString(String(providerConfig.http)),
        priority: Number(providerConfig.priority),
        maxRetries: Number(providerConfig.maxRetries)
      };
    };

    const rpcProviders = chainConfig.rpcProviders as Record<string, unknown>;
    const fallbackProviders = rpcProviders.fallback as unknown[];

    return {
      chainId: Number(chainConfig.chainId),
      name: String(chainConfig.name),
      nativeCurrency: chainConfig.nativeCurrency as ChainConfig['nativeCurrency'],
      rpcProviders: {
        primary: resolveProvider(rpcProviders.primary),
        fallback: fallbackProviders.map(resolveProvider)
      },
      performance: chainConfig.performance as ChainConfig['performance']
    };
  }

  /**
   * Set up wallet account from private key
   */
  private setupAccount(): PrivateKeyAccount {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      throw new Error('PRIVATE_KEY must be a valid hex string starting with 0x and 64 characters long');
    }

    const account = privateKeyToAccount(privateKey as `0x${string}`);
    logger.debug('Wallet account configured', { 
      address: account.address 
    });

    return account;
  }

  /**
   * Create provider instances for all chains and providers
   */
  private async createProviderInstances(): Promise<void> {
    for (const [chainId, chainConfig] of this.chains) {
      const chainProviders: ProviderInstance[] = [];
      const viemChain = this.chainMappings.get(chainId);
      
      if (!viemChain) {
        throw new Error(`No viem chain mapping found for chain ID: ${chainId}`);
      }

      // Create primary provider instance
      const primaryProvider = await this.createProviderInstance(
        chainConfig.rpcProviders.primary,
        viemChain,
        chainConfig.performance.rpcTimeout
      );
      chainProviders.push(primaryProvider);

      // Create fallback provider instances
      for (const fallbackConfig of chainConfig.rpcProviders.fallback) {
        const fallbackProvider = await this.createProviderInstance(
          fallbackConfig,
          viemChain,
          chainConfig.performance.rpcTimeout
        );
        chainProviders.push(fallbackProvider);
      }

      // Sort providers by priority
      chainProviders.sort((a, b) => a.priority - b.priority);
      
      // Ensure we have at least one provider
      if (chainProviders.length === 0) {
        throw new Error(`No providers created for chain ${chainId}`);
      }
      
      // TypeScript assertion: we know chainProviders[0] exists after length check
      const firstProvider = chainProviders[0]!;
      
      this.providers.set(chainId, chainProviders);
      this.currentProviders.set(chainId, firstProvider);

      logger.debug('Provider instances created for chain', {
        chainId,
        chainName: chainConfig.name,
        providersCount: chainProviders.length,
        currentProvider: firstProvider.name
      });
    }
  }

  /**
   * Create a single provider instance with all clients
   */
  private async createProviderInstance(
    config: RpcProviderConfig,
    chain: Chain,
    timeout: number
  ): Promise<ProviderInstance> {
    try {
      // Create HTTP transport for regular operations
      const httpTransport = http(config.http, {
        timeout: timeout,
        retryCount: config.maxRetries,
        retryDelay: 1000
      });

      // Create WebSocket transport for real-time monitoring
      const wsTransport = webSocket(config.websocket, {
        timeout: timeout,
        retryCount: config.maxRetries,
        retryDelay: 1000
      });

      // Create public client for read operations
      const publicClient = createPublicClient({
        chain,
        transport: httpTransport
      });

      // Create wallet client for transactions
      const walletClient = createWalletClient({
        chain,
        account: this.account,
        transport: httpTransport
      });

      // Create WebSocket client for real-time data
      const webSocketClient = createPublicClient({
        chain,
        transport: wsTransport
      });

      return {
        name: config.name,
        priority: config.priority,
        publicClient,
        walletClient,
        webSocketClient,
        isHealthy: true, // Will be verified in health check
        lastHealthCheck: 0,
        consecutiveFailures: 0,
        responseTime: 0
      };
    } catch (error) {
      logger.error('Failed to create provider instance', error instanceof Error ? error : new Error(String(error)), {
        providerName: config.name,
        chain: chain.name
      });
      throw error;
    }
  }

  /**
   * Perform initial health checks on all providers
   */
  private async performInitialHealthChecks(): Promise<void> {
    logger.info('Performing initial health checks on all providers...');
    
    const healthCheckPromises: Promise<void>[] = [];
    
    for (const [chainId, providers] of this.providers) {
      for (const provider of providers) {
        healthCheckPromises.push(this.checkProviderHealth(chainId, provider));
      }
    }

    await Promise.allSettled(healthCheckPromises);
    
    // Log health check results - FIXED undefined handling
    for (const [chainId, providers] of this.providers) {
      const healthyCount = providers.filter(p => p.isHealthy).length;
      const chainConfig = this.chains.get(chainId);
      
      if (!chainConfig) {
        logger.error('Chain configuration not found during health check', { chainId });
        continue;
      }
      
      const currentProvider = this.currentProviders.get(chainId);
      
      logger.info('Initial health check completed for chain', {
        chainId,
        chainName: chainConfig.name,
        totalProviders: providers.length,
        healthyProviders: healthyCount,
        currentProvider: currentProvider?.name || 'none'
      });
      
      // If current provider is unhealthy, switch to a healthy one - FIXED undefined handling
      if (currentProvider && !currentProvider.isHealthy) {
        await this.switchToHealthyProvider(chainId, 'initial_health_check_failed');
      }
    }
  }

  /**
   * Check health of a specific provider
   */
  private async checkProviderHealth(chainId: number, provider: ProviderInstance): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Perform basic connectivity test
      const blockNumber = await provider.publicClient.getBlockNumber();
      const responseTime = Date.now() - startTime;
      
      // Update provider metrics
      provider.isHealthy = true;
      provider.lastHealthCheck = Date.now();
      provider.consecutiveFailures = 0;
      provider.responseTime = responseTime;
      
      // Cache health status in Redis (only if Redis is healthy)
      if (redisCache.isHealthy()) {
        await this.cacheProviderHealth(chainId, provider);
      }
      
      logger.debug('Provider health check passed', {
        chainId,
        provider: provider.name,
        responseTime,
        blockNumber: blockNumber.toString()
      });
    } catch (error) {
      provider.isHealthy = false;
      provider.lastHealthCheck = Date.now();
      provider.consecutiveFailures++;
      provider.responseTime = Date.now() - startTime;
      
      logger.warn('Provider health check failed', {
        chainId,
        provider: provider.name,
        consecutiveFailures: provider.consecutiveFailures,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Cache provider health status in Redis
   */
  private async cacheProviderHealth(chainId: number, provider: ProviderInstance): Promise<void> {
    try {
      const healthData = {
        name: provider.name,
        isHealthy: provider.isHealthy,
        lastHealthCheck: provider.lastHealthCheck,
        consecutiveFailures: provider.consecutiveFailures,
        responseTime: provider.responseTime
      };
      
      await redisCache.set(
        `provider_health:${chainId}:${provider.name}`,
        healthData,
        300 // 5 minute TTL
      );
    } catch (error) {
      // Don't throw on cache errors - health checks are more important
      logger.warn('Failed to cache provider health status', {
        chainId,
        provider: provider.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Switch to a healthy provider for the given chain - FIXED undefined handling
   */
  private async switchToHealthyProvider(chainId: number, reason: string): Promise<boolean> {
    const providers = this.providers.get(chainId);
    if (!providers) {
      logger.error('No providers found for chain', { chainId });
      return false;
    }

    // Find the best healthy provider (lowest priority number = highest priority)
    const healthyProviders = providers.filter(p => p.isHealthy);
    if (healthyProviders.length === 0) {
      logger.error('No healthy providers available for chain', { chainId });
      return false;
    }

    // Sort and get the best provider - FIXED undefined handling
    const sortedHealthyProviders = healthyProviders.sort((a, b) => a.priority - b.priority);
    const bestProvider = sortedHealthyProviders[0];
    
    if (!bestProvider) {
      logger.error('Failed to find best provider after sorting', { chainId });
      return false;
    }

    const currentProvider = this.currentProviders.get(chainId);
    
    if (!currentProvider || currentProvider.name !== bestProvider.name) {
      this.currentProviders.set(chainId, bestProvider);
      
      logger.warn('Provider switched', {
        chainId,
        oldProvider: currentProvider?.name || 'none',
        newProvider: bestProvider.name,
        reason
      });
      
      return true;
    }
    
    return false;
  }

  /**
   * Start continuous health monitoring
   */
  private startHealthMonitoring(): void {
    // Health check every 30 seconds as specified in the requirements
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000);
    
    logger.info('Health monitoring started', { interval: '30 seconds' });
  }

  /**
   * Perform health checks on all providers - SIMPLIFIED logic
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises: Promise<void>[] = [];
    
    // Simplified: directly iterate over all chains and their providers
    for (const [chainId, providers] of this.providers) {
      for (const provider of providers) {
        healthCheckPromises.push(this.checkProviderHealth(chainId, provider));
      }
    }

    await Promise.allSettled(healthCheckPromises);
    
    // Check if we need to switch providers
    for (const [chainId] of this.providers) {
      const currentProvider = this.currentProviders.get(chainId);
      if (currentProvider && !currentProvider.isHealthy) {
        await this.switchToHealthyProvider(chainId, 'health_check_failed');
      }
    }
  }

  /**
   * Get the best HTTP public client for a chain - Enhanced with advanced monitoring
   */
  getHttpProvider(chainId: number): PublicClient {
    this.ensureInitialized();
    
    const currentProvider = this.currentProviders.get(chainId);
    if (!currentProvider) {
      throw new Error(`No provider available for chain ${chainId}`);
    }
    
    // Track request start for load balancing
    if (this.isAdvancedMonitoringEnabled && this.failoverLogic) {
      this.failoverLogic.requestStarted(chainId, currentProvider.name);
    }
    
    if (!currentProvider.isHealthy) {
      // Try to switch to a healthy provider (async operation, don't wait)
      this.switchToHealthyProvider(chainId, 'get_http_provider_unhealthy').catch(error => {
        logger.warn('Failed to switch provider during HTTP provider request', { chainId, error });
      });
    }
    
    return currentProvider.publicClient;
  }

  /**
   * Get the best WebSocket provider for a chain - Enhanced with advanced monitoring
   */
  getWebSocketProvider(chainId: number): PublicClient {
    this.ensureInitialized();
    
    const currentProvider = this.currentProviders.get(chainId);
    if (!currentProvider) {
      throw new Error(`No WebSocket provider available for chain ${chainId}`);
    }
    
    // Track request start for load balancing
    if (this.isAdvancedMonitoringEnabled && this.failoverLogic) {
      this.failoverLogic.requestStarted(chainId, currentProvider.name);
    }
    
    if (!currentProvider.isHealthy) {
      // Try to switch to a healthy provider (async operation, don't wait)
      this.switchToHealthyProvider(chainId, 'get_websocket_provider_unhealthy').catch(error => {
        logger.warn('Failed to switch provider during WebSocket provider request', { chainId, error });
      });
    }
    
    return currentProvider.webSocketClient;
  }

  /**
   * Get wallet client for transactions - Enhanced with advanced monitoring
   */
  getWalletClient(chainId: number): WalletClient {
    this.ensureInitialized();
    
    const currentProvider = this.currentProviders.get(chainId);
    if (!currentProvider) {
      throw new Error(`No wallet client available for chain ${chainId}`);
    }
    
    // Track request start for load balancing
    if (this.isAdvancedMonitoringEnabled && this.failoverLogic) {
      this.failoverLogic.requestStarted(chainId, currentProvider.name);
    }
    
    if (!currentProvider.isHealthy) {
      // Try to switch to a healthy provider (async operation, don't wait)
      this.switchToHealthyProvider(chainId, 'get_wallet_client_unhealthy').catch(error => {
        logger.warn('Failed to switch provider during wallet client request', { chainId, error });
      });
    }
    
    return currentProvider.walletClient;
  }

  /**
   * Force switch to next provider for a chain - Enhanced with intelligent selection
   */
  async switchProvider(chainId: number, reason: string): Promise<boolean> {
    this.ensureInitialized();
    
    const providers = this.providers.get(chainId);
    if (!providers) {
      throw new Error(`No providers configured for chain ${chainId}`);
    }

    const currentProvider = this.currentProviders.get(chainId);
    if (!currentProvider) {
      throw new Error(`No current provider set for chain ${chainId}`);
    }

    // Mark current provider as unhealthy to force a switch
    currentProvider.isHealthy = false;
    currentProvider.consecutiveFailures++;
    
    // Use intelligent provider selection if advanced monitoring is enabled
    if (this.isAdvancedMonitoringEnabled) {
      return await this.switchToIntelligentProvider(chainId, reason);
    } else {
      return await this.switchToHealthyProvider(chainId, reason);
    }
  }
  
  /**
   * Switch to provider using intelligent selection from failover logic
   */
  private async switchToIntelligentProvider(chainId: number, reason: string): Promise<boolean> {
    try {
      // Get chain provider states from failover logic
      if (!this.failoverLogic) {
        logger.warn('Failover logic not available for intelligent switching', { chainId });
        return await this.switchToHealthyProvider(chainId, reason);
      }
      
      const chainStates = this.failoverLogic.getChainProviderStates(chainId);
      
      if (chainStates.length === 0) {
        logger.warn('No provider states available for intelligent switching', { chainId });
        return await this.switchToHealthyProvider(chainId, reason);
      }
      
      // Find best provider based on failover logic scoring
      const availableStates = chainStates.filter(state => 
        state.status !== 'failed' && 
        state.status !== 'circuit_open' &&
        state.circuitBreaker.state !== 'open'
      );
      
      if (availableStates.length === 0) {
        logger.warn('No available providers found by intelligent selection', { chainId });
        return await this.switchToHealthyProvider(chainId, reason);
      }
      
      // Sort by load score (lower = better)
      availableStates.sort((a, b) => a.loadMetrics.loadScore - b.loadMetrics.loadScore);
      const bestState = availableStates[0];
      
      // Find the corresponding provider instance
      const providers = this.providers.get(chainId);
      if (!providers) {
        return false;
      }
      
      const bestProvider = providers.find(p => p.name === bestState?.name);
      if (!bestProvider) {
        logger.warn('Best provider not found in provider instances', {
          chainId,
          bestProviderName: bestState?.name || 'unknown'
        });
        return await this.switchToHealthyProvider(chainId, reason);
      }
      
      // Perform the switch
      const currentProvider = this.currentProviders.get(chainId);
      this.currentProviders.set(chainId, bestProvider);
      
      logger.info('Intelligent provider switch completed', {
        chainId,
        oldProvider: currentProvider?.name || 'none',
        newProvider: bestProvider.name,
        reason,
        loadScore: bestState?.loadMetrics.loadScore || 0,
        healthStatus: bestState?.status || 'unknown'
      });
      
      return true;
      
    } catch (error) {
      logger.error('Failed to perform intelligent provider switch', error instanceof Error ? error : new Error(String(error)), {
        chainId,
        reason
      });
      
      // Fallback to basic switching
      return await this.switchToHealthyProvider(chainId, reason);
    }
  }

  /**
   * Get provider statistics for a chain - Enhanced with advanced metrics
   */
  getProviderStats(chainId: number): ProviderStats[] {
    this.ensureInitialized();
    
    const providers = this.providers.get(chainId);
    if (!providers) {
      throw new Error(`No providers configured for chain ${chainId}`);
    }

    return providers.map(provider => {
      const baseStats = {
        name: provider.name,
        priority: provider.priority,
        isHealthy: provider.isHealthy,
        consecutiveFailures: provider.consecutiveFailures,
        responseTime: provider.responseTime,
        lastHealthCheck: provider.lastHealthCheck,
        successRate: 0,
        totalRequests: 0,
        successfulRequests: 0
      };
      
      // Enhance with advanced monitoring data if available
      if (this.isAdvancedMonitoringEnabled && this.healthMonitor && typeof this.healthMonitor.getProviderHealthMetrics === 'function') {
        const healthMetrics = this.healthMonitor.getProviderHealthMetrics(chainId, provider.name);
        if (healthMetrics) {
          baseStats.successRate = healthMetrics.successRate;
          baseStats.totalRequests = healthMetrics.totalRequests;
          baseStats.successfulRequests = healthMetrics.successfulRequests;
        }
      }
      
      return baseStats;
    });
  }

  /**
   * Get connection statistics for all chains - Enhanced with comprehensive metrics
   */
  getConnectionStats(): ConnectionStats[] {
    this.ensureInitialized();
    
    const stats: ConnectionStats[] = [];
    
    for (const [chainId, providers] of this.providers) {
      const chainConfig = this.chains.get(chainId);
      if (!chainConfig) {
        logger.warn('Chain configuration not found for connection stats', { chainId });
        continue;
      }

      const currentProvider = this.currentProviders.get(chainId);
      const healthyProviders = providers.filter(p => p.isHealthy);
      const averageResponseTime = providers.length > 0 
        ? providers.reduce((sum, p) => sum + p.responseTime, 0) / providers.length 
        : 0;
      
      let totalRequests = 0;
      let successfulRequests = 0;
      let successRate = 0;
      
      // Enhance with advanced monitoring data if available
      if (this.isAdvancedMonitoringEnabled && this.healthMonitor && 
          typeof this.healthMonitor.getChainHealthStatus === 'function' && 
          typeof this.healthMonitor.getAllProviderMetrics === 'function') {
        const chainHealthStatus = this.healthMonitor.getChainHealthStatus(chainId);
        if (chainHealthStatus) {
          // Get aggregated metrics from health monitor
          const allMetrics = this.healthMonitor.getAllProviderMetrics()
            .filter(m => m.chainId === chainId);
          
          totalRequests = allMetrics.reduce((sum, m) => sum + m.totalRequests, 0);
          successfulRequests = allMetrics.reduce((sum, m) => sum + m.successfulRequests, 0);
          successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;
        }
      }
      
      stats.push({
        chainId,
        chainName: chainConfig.name,
        totalProviders: providers.length,
        healthyProviders: healthyProviders.length,
        currentProvider: currentProvider?.name || 'none',
        averageResponseTime,
        totalRequests,
        successfulRequests,
        successRate
      });
    }
    
    return stats;
  }

  /**
   * Check if provider manager is healthy - Enhanced with advanced monitoring
   */
  isHealthy(): boolean {
    if (!this.isInitialized) {
      return false;
    }
    
    // At least one healthy provider per chain
    for (const [, providers] of this.providers) {
      const healthyProviders = providers.filter(p => p.isHealthy);
      if (healthyProviders.length === 0) {
        return false;
      }
    }
    
    // Check advanced monitoring components if enabled
    if (this.isAdvancedMonitoringEnabled && this.healthMonitor && this.failoverLogic) {
      if (typeof this.healthMonitor.isHealthy === 'function' && typeof this.failoverLogic.isHealthy === 'function') {
        if (!this.healthMonitor.isHealthy() || !this.failoverLogic.isHealthy()) {
          logger.warn('Advanced monitoring components are not healthy');
          // Don't return false - basic functionality should still work
        }
      }
    }
    
    return true;
  }

  /**
   * Graceful shutdown - Enhanced with advanced monitoring cleanup
   */
  async shutdown(): Promise<void> {
    logger.shutdown('Shutting down RPC Provider Manager...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Shutdown advanced monitoring components
    if (this.isAdvancedMonitoringEnabled && this.healthMonitor && this.failoverLogic) {
      try {
        await this.healthMonitor.shutdown();
        await this.failoverLogic.shutdown();
        logger.shutdown('Advanced monitoring components shut down');
      } catch (error) {
        logger.error('Error shutting down advanced monitoring components', error instanceof Error ? error : new Error(String(error)));
      }
    }
    
    // Note: viem clients don't need explicit cleanup
    // WebSocket connections will be closed automatically
    
    this.isInitialized = false;
    logger.shutdown('RPC Provider Manager shutdown complete');
  }

  /**
   * Ensure the manager is initialized
   */
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('RPC Provider Manager is not initialized. Call initialize() first.');
    }
  }
}

// Export singleton instance
export const rpcProviderManager = new RpcProviderManager();
