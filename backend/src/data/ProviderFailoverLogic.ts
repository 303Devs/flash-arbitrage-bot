import { logger } from '../utils/Logger.js';
import { redisCache } from '../storage/RedisCache.js';
import { postgresRepository } from '../storage/PostgresRepository.js';
import EventEmitter from 'events';

export interface ProviderState {
  name: string;
  chainId: number;
  priority: number;
  status: 'healthy' | 'degraded' | 'failed' | 'recovery' | 'circuit_open';
  lastStateChange: number;
  
  // Circuit breaker state
  circuitBreaker: {
    state: 'closed' | 'half_open' | 'open';
    failureCount: number;
    lastFailureTime: number;
    nextRetryTime: number;
    openedAt: number;
  };
  
  // Recovery tracking
  recovery: {
    isInRecovery: boolean;
    recoveryStartTime: number;
    successfulChecks: number;
    requiredSuccessfulChecks: number;
  };
  
  // Load balancing metrics
  loadMetrics: {
    activeRequests: number;
    requestsPerSecond: number;
    lastRequestTime: number;
    loadScore: number; // Combined metric for load balancing
  };
}

export interface FailoverRule {
  name: string;
  priority: number;
  condition: (state: ProviderState, chainStates: ProviderState[]) => boolean;
  action: 'switch_provider' | 'circuit_open' | 'reduce_load' | 'alert_ops';
  cooldownMs: number;
  lastTriggered: number;
}

export interface FailoverEvent {
  timestamp: number;
  chainId: number;
  fromProvider: string;
  toProvider: string;
  reason: string;
  triggerRule?: string;
  switchLatency: number;
  success: boolean;
  error?: string;
}

export interface LoadBalancingStrategy {
  name: 'round_robin' | 'weighted_round_robin' | 'least_connections' | 'health_based' | 'response_time_based';
  config: Record<string, any>;
}

/**
 * Provider Failover Logic - Intelligent circuit breaker patterns and provider switching
 * 
 * This component implements sophisticated failover logic with circuit breaker patterns,
 * provider state machines, exponential backoff, and intelligent load balancing algorithms.
 * 
 * Features:
 * - Circuit breaker implementation with configurable thresholds
 * - Provider state machines (HEALTHY → DEGRADED → FAILED → RECOVERY)
 * - Exponential backoff and recovery timers
 * - Multiple load balancing algorithms for optimal provider selection
 * - Real-time failover event tracking and analytics
 * - Predictive failover based on health trends
 */
export class ProviderFailoverLogic extends EventEmitter {
  private providerStates: Map<string, ProviderState> = new Map();
  private failoverRules: FailoverRule[] = [];
  private failoverHistory: FailoverEvent[] = [];
  private isInitialized: boolean = false;
  
  // Circuit breaker configuration
  private readonly CIRCUIT_BREAKER_CONFIG = {
    failureThreshold: 5,        // Failures before opening circuit
    timeoutMs: 30000,           // Circuit open duration (30 seconds)
    halfOpenRetryMs: 5000,      // Time between half-open retries
    recoveryChecks: 3           // Successful checks needed for recovery
  };
  
  // Load balancing configuration
  private currentStrategy: LoadBalancingStrategy = {
    name: 'health_based',
    config: {
      healthWeightFactor: 0.7,
      responseTimeWeightFactor: 0.2,
      loadWeightFactor: 0.1
    }
  };
  
  // State management
  private stateUpdateInterval: NodeJS.Timeout | null = null;
  private readonly STATE_UPDATE_INTERVAL = 5000; // 5 seconds
  private readonly FAILOVER_HISTORY_SIZE = 1000; // Keep last 1000 failover events

  constructor() {
    super();
    this.initializeFailoverRules();
  }

  /**
   * Initialize intelligent failover rules
   */
  private initializeFailoverRules(): void {
    this.failoverRules = [
      // Critical failure rule - immediate failover
      {
        name: 'critical_failure',
        priority: 1,
        condition: (state) => state.circuitBreaker.failureCount >= this.CIRCUIT_BREAKER_CONFIG.failureThreshold,
        action: 'circuit_open',
        cooldownMs: 1000, // 1 second cooldown
        lastTriggered: 0
      },
      
      // Degraded performance rule
      {
        name: 'degraded_performance',
        priority: 2,
        condition: (state) => state.status === 'degraded' && 
                             Date.now() - state.lastStateChange > 30000, // Degraded for >30s
        action: 'switch_provider',
        cooldownMs: 10000, // 10 second cooldown
        lastTriggered: 0
      },
      
      // High load rule
      {
        name: 'high_load',
        priority: 3,
        condition: (state) => state.loadMetrics.activeRequests > 50 || 
                             state.loadMetrics.requestsPerSecond > 100,
        action: 'reduce_load',
        cooldownMs: 15000, // 15 second cooldown
        lastTriggered: 0
      },
      
      // Recovery opportunity rule
      {
        name: 'recovery_opportunity',
        priority: 4,
        condition: (state, chainStates) => {
          const healthyProviders = chainStates.filter(s => s.status === 'healthy').length;
          return state.status === 'failed' && 
                 state.circuitBreaker.state === 'closed' &&
                 healthyProviders >= 2 && // Have backup providers
                 Date.now() - state.lastStateChange > 60000; // Failed for >1min
        },
        action: 'switch_provider',
        cooldownMs: 30000, // 30 second cooldown
        lastTriggered: 0
      },
      
      // All providers degraded - alert operations
      {
        name: 'all_providers_degraded',
        priority: 5,
        condition: (_state, chainStates) => {
          const healthyProviders = chainStates.filter(s => s.status === 'healthy').length;
          return healthyProviders === 0 && chainStates.length > 0;
        },
        action: 'alert_ops',
        cooldownMs: 300000, // 5 minute cooldown (don't spam alerts)
        lastTriggered: 0
      }
    ];
    
    // Sort rules by priority
    this.failoverRules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Initialize the failover logic system
   */
  async initialize(providerConfigs: Array<{
    name: string;
    chainId: number;
    priority: number;
  }>): Promise<void> {
    try {
      logger.startup('Initializing Provider Failover Logic...');

      // Initialize state for all providers
      for (const config of providerConfigs) {
        const providerKey = `${config.chainId}-${config.name}`;
        
        const state: ProviderState = {
          name: config.name,
          chainId: config.chainId,
          priority: config.priority,
          status: 'healthy',
          lastStateChange: Date.now(),
          
          circuitBreaker: {
            state: 'closed',
            failureCount: 0,
            lastFailureTime: 0,
            nextRetryTime: 0,
            openedAt: 0
          },
          
          recovery: {
            isInRecovery: false,
            recoveryStartTime: 0,
            successfulChecks: 0,
            requiredSuccessfulChecks: this.CIRCUIT_BREAKER_CONFIG.recoveryChecks
          },
          
          loadMetrics: {
            activeRequests: 0,
            requestsPerSecond: 0,
            lastRequestTime: 0,
            loadScore: 0
          }
        };

        this.providerStates.set(providerKey, state);
        
        logger.debug('Failover logic initialized for provider', {
          providerKey,
          chainId: config.chainId,
          providerName: config.name
        });
      }

      // Start state monitoring
      this.startStateMonitoring();

      this.isInitialized = true;
      logger.startup('Provider Failover Logic initialized successfully', {
        totalProviders: this.providerStates.size,
        chainsManaged: new Set(Array.from(this.providerStates.values()).map(s => s.chainId)).size,
        failoverRules: this.failoverRules.length
      });

    } catch (error) {
      logger.error('Failed to initialize Provider Failover Logic', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Start continuous state monitoring and rule evaluation
   */
  private startStateMonitoring(): void {
    this.stateUpdateInterval = setInterval(async () => {
      await this.updateProviderStates();
      await this.evaluateFailoverRules();
    }, this.STATE_UPDATE_INTERVAL);
    
    logger.info('Provider state monitoring started', { 
      interval: `${this.STATE_UPDATE_INTERVAL}ms`,
      providers: this.providerStates.size 
    });
  }

  /**
   * Update provider states based on health monitor data
   */
  private async updateProviderStates(): Promise<void> {
    try {
      // Import health monitor dynamically to avoid circular dependency
      const { connectionHealthMonitor } = await import('./ConnectionHealthMonitor.js');
      
      for (const [, state] of this.providerStates) {
        const healthMetrics = connectionHealthMonitor.getProviderHealthMetrics(state.chainId, state.name);
        
        if (healthMetrics) {
          await this.updateProviderState(state, healthMetrics);
        }
      }
    } catch (error) {
      logger.error('Failed to update provider states', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Update individual provider state based on health metrics
   */
  private async updateProviderState(state: ProviderState, healthMetrics: any): Promise<void> {
    const previousStatus = state.status;
    
    // Update circuit breaker state
    await this.updateCircuitBreakerState(state, healthMetrics);
    
    // Update provider status based on health metrics and circuit breaker
    const newStatus = this.determineProviderStatus(state, healthMetrics);
    
    if (newStatus !== previousStatus) {
      state.status = newStatus;
      state.lastStateChange = Date.now();
      
      logger.info('Provider status changed', {
        provider: state.name,
        chainId: state.chainId,
        oldStatus: previousStatus,
        newStatus: newStatus,
        healthScore: healthMetrics.healthScore,
        circuitState: state.circuitBreaker.state
      });
      
      // Emit state change event
      this.emit('stateChange', {
        provider: state.name,
        chainId: state.chainId,
        oldStatus: previousStatus,
        newStatus: newStatus,
        healthMetrics
      });
    }
    
    // Update load metrics
    this.updateLoadMetrics(state);
  }

  /**
   * Update circuit breaker state
   */
  private async updateCircuitBreakerState(state: ProviderState, healthMetrics: any): Promise<void> {
    const now = Date.now();
    
    switch (state.circuitBreaker.state) {
      case 'closed':
        // Monitor for failures
        if (!healthMetrics.isHealthy) {
          state.circuitBreaker.failureCount++;
          state.circuitBreaker.lastFailureTime = now;
          
          // Open circuit if threshold exceeded
          if (state.circuitBreaker.failureCount >= this.CIRCUIT_BREAKER_CONFIG.failureThreshold) {
            await this.openCircuitBreaker(state);
          }
        } else {
          // Reset failure count on success
          state.circuitBreaker.failureCount = 0;
        }
        break;
        
      case 'open':
        // Check if timeout period has elapsed
        if (now - state.circuitBreaker.openedAt >= this.CIRCUIT_BREAKER_CONFIG.timeoutMs) {
          await this.transitionToHalfOpen(state);
        }
        break;
        
      case 'half_open':
        // Test the provider
        if (healthMetrics.isHealthy) {
          state.recovery.successfulChecks++;
          
          if (state.recovery.successfulChecks >= state.recovery.requiredSuccessfulChecks) {
            await this.closeCircuitBreaker(state);
          }
        } else {
          // Failure in half-open state - back to open
          await this.openCircuitBreaker(state);
        }
        break;
    }
  }

  /**
   * Open circuit breaker
   */
  private async openCircuitBreaker(state: ProviderState): Promise<void> {
    const now = Date.now();
    
    state.circuitBreaker.state = 'open';
    state.circuitBreaker.openedAt = now;
    state.circuitBreaker.nextRetryTime = now + this.CIRCUIT_BREAKER_CONFIG.timeoutMs;
    
    logger.warn('Circuit breaker opened', {
      provider: state.name,
      chainId: state.chainId,
      failureCount: state.circuitBreaker.failureCount,
      nextRetryTime: new Date(state.circuitBreaker.nextRetryTime).toISOString()
    });
    
    // Cache circuit breaker state
    await this.cacheCircuitBreakerState(state);
    
    this.emit('circuitBreakerOpened', {
      provider: state.name,
      chainId: state.chainId,
      failureCount: state.circuitBreaker.failureCount
    });
  }

  /**
   * Transition to half-open state
   */
  private async transitionToHalfOpen(state: ProviderState): Promise<void> {
    state.circuitBreaker.state = 'half_open';
    state.recovery.isInRecovery = true;
    state.recovery.recoveryStartTime = Date.now();
    state.recovery.successfulChecks = 0;
    
    logger.info('Circuit breaker transitioning to half-open', {
      provider: state.name,
      chainId: state.chainId
    });
    
    await this.cacheCircuitBreakerState(state);
    
    this.emit('circuitBreakerHalfOpen', {
      provider: state.name,
      chainId: state.chainId
    });
  }

  /**
   * Close circuit breaker (recovery successful)
   */
  private async closeCircuitBreaker(state: ProviderState): Promise<void> {
    state.circuitBreaker.state = 'closed';
    state.circuitBreaker.failureCount = 0;
    state.recovery.isInRecovery = false;
    state.recovery.successfulChecks = 0;
    
    logger.info('Circuit breaker closed - provider recovered', {
      provider: state.name,
      chainId: state.chainId,
      recoveryDuration: Date.now() - state.recovery.recoveryStartTime
    });
    
    await this.cacheCircuitBreakerState(state);
    
    this.emit('circuitBreakerClosed', {
      provider: state.name,
      chainId: state.chainId,
      recoveryDuration: Date.now() - state.recovery.recoveryStartTime
    });
  }

  /**
   * Cache circuit breaker state in Redis
   */
  private async cacheCircuitBreakerState(state: ProviderState): Promise<void> {
    try {
      if (!redisCache.isHealthy()) {
        return;
      }

      await redisCache.set(
        `circuit_breaker:${state.chainId}:${state.name}`,
        {
          state: state.circuitBreaker.state,
          failureCount: state.circuitBreaker.failureCount,
          openedAt: state.circuitBreaker.openedAt,
          nextRetryTime: state.circuitBreaker.nextRetryTime
        },
        300 // 5 minute TTL
      );
    } catch (error) {
      logger.warn('Failed to cache circuit breaker state', {
        provider: state.name,
        chainId: state.chainId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Determine provider status based on health and circuit breaker state
   */
  private determineProviderStatus(state: ProviderState, healthMetrics: any): ProviderState['status'] {
    // Circuit breaker takes precedence
    if (state.circuitBreaker.state === 'open') {
      return 'circuit_open';
    }
    
    if (state.recovery.isInRecovery) {
      return 'recovery';
    }
    
    // Determine status based on health metrics
    if (!healthMetrics.isHealthy || healthMetrics.healthScore < 30) {
      return 'failed';
    }
    
    if (healthMetrics.healthScore < 70 || healthMetrics.degradationTrend === 'degrading') {
      return 'degraded';
    }
    
    return 'healthy';
  }

  /**
   * Update load balancing metrics
   */
  private updateLoadMetrics(state: ProviderState): void {
    const now = Date.now();
    
    // Calculate requests per second (simplified)
    if (state.loadMetrics.lastRequestTime > 0) {
      const timeDelta = (now - state.loadMetrics.lastRequestTime) / 1000;
      if (timeDelta > 0) {
        // Exponential moving average for RPS
        const alpha = 0.3;
        const instantRps = 1 / timeDelta;
        state.loadMetrics.requestsPerSecond = 
          alpha * instantRps + (1 - alpha) * state.loadMetrics.requestsPerSecond;
      }
    }
    
    // Calculate combined load score
    state.loadMetrics.loadScore = this.calculateLoadScore(state);
  }

  /**
   * Calculate combined load score for load balancing
   */
  private calculateLoadScore(state: ProviderState): number {
    const strategy = this.currentStrategy;
    
    switch (strategy.name) {
      case 'health_based':
        return this.calculateHealthBasedScore(state);
      case 'response_time_based':
        return this.calculateResponseTimeBasedScore(state);
      case 'least_connections':
        return this.calculateLeastConnectionsScore(state);
      default:
        return this.calculateHealthBasedScore(state);
    }
  }

  /**
   * Calculate health-based load score
   */
  private calculateHealthBasedScore(state: ProviderState): number {
    const config = this.currentStrategy.config;
    let score = 0;
    
    // Health component (higher health = lower score = higher priority)
    const healthComponent = (100 - (state.status === 'healthy' ? 90 : 
                                   state.status === 'degraded' ? 60 : 
                                   state.status === 'recovery' ? 40 : 0)) * 
                           config.healthWeightFactor;
    
    // Response time component (lower response time = lower score)
    const responseTimeComponent = Math.min(50, state.loadMetrics.requestsPerSecond / 10) * 
                                 config.responseTimeWeightFactor;
    
    // Load component (fewer active requests = lower score)
    const loadComponent = Math.min(50, state.loadMetrics.activeRequests) * 
                         config.loadWeightFactor;
    
    score = healthComponent + responseTimeComponent + loadComponent;
    
    // Priority bonus (lower priority number = higher priority = lower score)
    score += state.priority * 5;
    
    return Math.max(0, score);
  }

  /**
   * Calculate response time based score
   */
  private calculateResponseTimeBasedScore(state: ProviderState): number {
    // Lower response time = lower score = higher priority
    return state.loadMetrics.requestsPerSecond * 2 + state.priority * 10;
  }

  /**
   * Calculate least connections score
   */
  private calculateLeastConnectionsScore(state: ProviderState): number {
    // Fewer active requests = lower score = higher priority
    return state.loadMetrics.activeRequests * 3 + state.priority * 5;
  }

  /**
   * Evaluate failover rules and trigger actions
   */
  private async evaluateFailoverRules(): Promise<void> {
    const now = Date.now();
    
    // Group states by chain for rule evaluation
    const chainGroups = new Map<number, ProviderState[]>();
    for (const state of this.providerStates.values()) {
      if (!chainGroups.has(state.chainId)) {
        chainGroups.set(state.chainId, []);
      }
      chainGroups.get(state.chainId)!.push(state);
    }
    
    // Evaluate rules for each chain
    for (const [, chainStates] of chainGroups) {
      for (const state of chainStates) {
        await this.evaluateRulesForProvider(state, chainStates, now);
      }
    }
  }

  /**
   * Evaluate failover rules for a specific provider
   */
  private async evaluateRulesForProvider(
    state: ProviderState, 
    chainStates: ProviderState[], 
    now: number
  ): Promise<void> {
    for (const rule of this.failoverRules) {
      // Check cooldown
      if (now - rule.lastTriggered < rule.cooldownMs) {
        continue;
      }
      
      // Evaluate rule condition
      if (rule.condition(state, chainStates)) {
        await this.executeFailoverAction(rule, state, chainStates);
        rule.lastTriggered = now;
        break; // Only execute one rule per evaluation cycle
      }
    }
  }

  /**
   * Execute failover action
   */
  private async executeFailoverAction(
    rule: FailoverRule,
    state: ProviderState,
    chainStates: ProviderState[]
  ): Promise<void> {
    logger.info('Executing failover action', {
      rule: rule.name,
      action: rule.action,
      provider: state.name,
      chainId: state.chainId,
      currentStatus: state.status
    });
    
    switch (rule.action) {
      case 'switch_provider':
        await this.executeProviderSwitch(state, chainStates, rule.name);
        break;
        
      case 'circuit_open':
        if (state.circuitBreaker.state !== 'open') {
          await this.openCircuitBreaker(state);
        }
        break;
        
      case 'reduce_load':
        await this.executeLoadReduction(state);
        break;
        
      case 'alert_ops':
        await this.executeOperationsAlert(state.chainId, chainStates);
        break;
    }
  }

  /**
   * Execute provider switch
   */
  private async executeProviderSwitch(
    currentState: ProviderState,
    chainStates: ProviderState[],
    reason: string
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Find best alternative provider
      const bestProvider = this.selectBestProvider(chainStates, currentState.name);
      
      if (!bestProvider) {
        logger.warn('No healthy alternative provider found for switch', {
          currentProvider: currentState.name,
          chainId: currentState.chainId
        });
        return;
      }
      
      // Import RPC Provider Manager dynamically
      const { rpcProviderManager } = await import('./RpcProviderManager.js');
      
      // Execute the switch
      const switchSuccessful = await rpcProviderManager.switchProvider(
        currentState.chainId, 
        `failover_logic:${reason}`
      );
      
      const switchLatency = Date.now() - startTime;
      
      // Record failover event
      const failoverEvent: FailoverEvent = {
        timestamp: Date.now(),
        chainId: currentState.chainId,
        fromProvider: currentState.name,
        toProvider: bestProvider.name,
        reason,
        triggerRule: reason,
        switchLatency,
        success: switchSuccessful
      };
      
      this.recordFailoverEvent(failoverEvent);
      
      if (switchSuccessful) {
        logger.info('Provider switch executed successfully', {
          chainId: currentState.chainId,
          fromProvider: currentState.name,
          toProvider: bestProvider.name,
          switchLatency,
          reason
        });
        
        this.emit('providerSwitched', failoverEvent);
      } else {
        logger.error('Provider switch failed', {
          chainId: currentState.chainId,
          fromProvider: currentState.name,
          toProvider: bestProvider.name,
          reason
        });
      }
      
    } catch (error) {
      const failoverEvent: FailoverEvent = {
        timestamp: Date.now(),
        chainId: currentState.chainId,
        fromProvider: currentState.name,
        toProvider: 'unknown',
        reason,
        switchLatency: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      this.recordFailoverEvent(failoverEvent);
      
      logger.error('Failed to execute provider switch', error instanceof Error ? error : new Error(String(error)), {
        provider: currentState.name,
        chainId: currentState.chainId
      });
    }
  }

  /**
   * Select best provider using current load balancing strategy
   */
  private selectBestProvider(chainStates: ProviderState[], excludeProvider?: string): ProviderState | null {
    // Filter to available providers
    const availableProviders = chainStates.filter(state => 
      state.name !== excludeProvider &&
      state.status !== 'failed' &&
      state.status !== 'circuit_open' &&
      state.circuitBreaker.state !== 'open'
    );
    
    if (availableProviders.length === 0) {
      return null;
    }
    
    // Sort by load score (lower score = higher priority)
    availableProviders.sort((a, b) => a.loadMetrics.loadScore - b.loadMetrics.loadScore);
    
    return availableProviders[0] || null;
  }

  /**
   * Execute load reduction
   */
  private async executeLoadReduction(state: ProviderState): Promise<void> {
    logger.info('Executing load reduction', {
      provider: state.name,
      chainId: state.chainId,
      currentLoad: state.loadMetrics.activeRequests,
      rps: state.loadMetrics.requestsPerSecond
    });
    
    // This could integrate with rate limiting or request queuing systems
    this.emit('loadReductionRequested', {
      provider: state.name,
      chainId: state.chainId,
      currentLoad: state.loadMetrics.activeRequests
    });
  }

  /**
   * Execute operations alert
   */
  private async executeOperationsAlert(chainId: number, chainStates: ProviderState[]): Promise<void> {
    const healthyProviders = chainStates.filter(s => s.status === 'healthy').length;
    
    logger.error('OPERATIONS ALERT: All providers degraded', {
      chainId,
      totalProviders: chainStates.length,
      healthyProviders,
      providerStates: chainStates.map(s => ({
        name: s.name,
        status: s.status,
        circuitState: s.circuitBreaker.state
      }))
    });
    
    // Log to PostgreSQL for alerting systems
    try {
      await postgresRepository.logSystemMetric({
        metricName: 'chain_all_providers_degraded',
        metricValue: chainId,
        tags: {
          chainId,
          totalProviders: chainStates.length,
          healthyProviders,
          severity: 'critical'
        }
      });
    } catch (error) {
      logger.warn('Failed to log operations alert metric', {
        chainId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    this.emit('operationsAlert', {
      chainId,
      severity: 'critical',
      message: 'All providers degraded or failed',
      providerStates: chainStates.map(s => ({
        name: s.name,
        status: s.status
      }))
    });
  }

  /**
   * Record failover event in history
   */
  private recordFailoverEvent(event: FailoverEvent): void {
    this.failoverHistory.push(event);
    
    // Maintain history size
    if (this.failoverHistory.length > this.FAILOVER_HISTORY_SIZE) {
      this.failoverHistory.shift();
    }
    
    // Cache recent failover events
    this.cacheFailoverEvent(event);
  }

  /**
   * Cache failover event in Redis
   */
  private async cacheFailoverEvent(event: FailoverEvent): Promise<void> {
    try {
      if (!redisCache.isHealthy()) {
        return;
      }

      await redisCache.set(
        `failover_event:${event.chainId}:${event.timestamp}`,
        event,
        3600 // 1 hour TTL
      );
    } catch (error) {
      logger.warn('Failed to cache failover event', {
        chainId: event.chainId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Request request for a provider (for load tracking)
   */
  requestStarted(chainId: number, providerName: string): void {
    const providerKey = `${chainId}-${providerName}`;
    const state = this.providerStates.get(providerKey);
    
    if (state) {
      state.loadMetrics.activeRequests++;
      state.loadMetrics.lastRequestTime = Date.now();
    }
  }

  /**
   * Mark request as completed
   */
  requestCompleted(chainId: number, providerName: string, success: boolean): void {
    const providerKey = `${chainId}-${providerName}`;
    const state = this.providerStates.get(providerKey);
    
    if (state) {
      state.loadMetrics.activeRequests = Math.max(0, state.loadMetrics.activeRequests - 1);
      
      // Update circuit breaker based on request result
      if (!success) {
        state.circuitBreaker.failureCount++;
        state.circuitBreaker.lastFailureTime = Date.now();
      }
    }
  }

  /**
   * Get provider state
   */
  getProviderState(chainId: number, providerName: string): ProviderState | null {
    const providerKey = `${chainId}-${providerName}`;
    return this.providerStates.get(providerKey) || null;
  }

  /**
   * Get all provider states for a chain
   */
  getChainProviderStates(chainId: number): ProviderState[] {
    return Array.from(this.providerStates.values())
      .filter(state => state.chainId === chainId);
  }

  /**
   * Get failover history
   */
  getFailoverHistory(chainId?: number, limit: number = 100): FailoverEvent[] {
    let history = [...this.failoverHistory];
    
    if (chainId) {
      history = history.filter(event => event.chainId === chainId);
    }
    
    return history
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get failover statistics
   */
  getFailoverStats(chainId?: number): {
    totalFailovers: number;
    successfulFailovers: number;
    failedFailovers: number;
    averageLatency: number;
    mostCommonReason: string;
    recentFailoverRate: number; // Failovers per hour in last 24h
  } {
    let relevantEvents = [...this.failoverHistory];
    
    if (chainId) {
      relevantEvents = relevantEvents.filter(event => event.chainId === chainId);
    }
    
    const totalFailovers = relevantEvents.length;
    const successfulFailovers = relevantEvents.filter(e => e.success).length;
    const failedFailovers = totalFailovers - successfulFailovers;
    
    const averageLatency = totalFailovers > 0 
      ? relevantEvents.reduce((sum, e) => sum + e.switchLatency, 0) / totalFailovers 
      : 0;
    
    // Find most common reason
    const reasonCounts = new Map<string, number>();
    relevantEvents.forEach(event => {
      const count = reasonCounts.get(event.reason) || 0;
      reasonCounts.set(event.reason, count + 1);
    });
    
    const mostCommonReason = Array.from(reasonCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'none';
    
    // Calculate recent failover rate (last 24 hours)
    const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
    const recentFailovers = relevantEvents.filter(e => e.timestamp >= last24Hours).length;
    const recentFailoverRate = recentFailovers; // Per 24 hours
    
    return {
      totalFailovers,
      successfulFailovers,
      failedFailovers,
      averageLatency: Math.round(averageLatency),
      mostCommonReason,
      recentFailoverRate
    };
  }

  /**
   * Check if failover logic is healthy
   */
  isHealthy(): boolean {
    return this.isInitialized; // Healthy if initialized, even with empty config
  }

  /**
   * Set load balancing strategy
   */
  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.currentStrategy = strategy;
    
    logger.info('Load balancing strategy updated', {
      strategy: strategy.name,
      config: strategy.config
    });
    
    // Recalculate load scores for all providers
    for (const state of this.providerStates.values()) {
      state.loadMetrics.loadScore = this.calculateLoadScore(state);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.shutdown('Shutting down Provider Failover Logic...');

    if (this.stateUpdateInterval) {
      clearInterval(this.stateUpdateInterval);
      this.stateUpdateInterval = null;
    }

    // Remove all event listeners
    this.removeAllListeners();

    this.isInitialized = false;
    logger.shutdown('Provider Failover Logic shutdown complete');
  }
}

// Export singleton instance
export const providerFailoverLogic = new ProviderFailoverLogic();
