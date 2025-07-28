import { logger } from '../utils/Logger.js';
import { redisCache } from '../storage/RedisCache.js';

export interface ProviderHealthMetrics {
  name: string;
  chainId: number;
  priority: number;
  
  // Connectivity metrics
  isHealthy: boolean;
  consecutiveFailures: number;
  lastHealthCheck: number;
  
  // Performance metrics
  responseTime: number;
  averageResponseTime: number;
  responseTimeHistory: number[];
  
  // Reliability metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  
  // Advanced metrics
  blockSyncStatus: {
    isInSync: boolean;
    blocksBehind: number;
    lastSyncCheck: number;
  };
  
  // Weighted health score (0-100)
  healthScore: number;
  degradationTrend: 'improving' | 'stable' | 'degrading' | 'critical';
}

export interface ChainHealthStatus {
  chainId: number;
  chainName: string;
  totalProviders: number;
  healthyProviders: number;
  degradedProviders: number;
  failedProviders: number;
  bestProvider: string;
  overallHealthScore: number;
  recommendedAction: 'continue' | 'switch_provider' | 'reduce_load' | 'alert_ops';
}

export interface HealthCheckResult {
  provider: string;
  chainId: number;
  success: boolean;
  responseTime: number;
  blockNumber?: bigint;
  error?: string;
  timestamp: number;
}

export interface HealthThresholds {
  // Response time thresholds (milliseconds)
  responseTime: {
    excellent: number;    // < 100ms
    good: number;         // < 300ms  
    acceptable: number;   // < 1000ms
    poor: number;         // < 3000ms
    // > poor = critical
  };
  
  // Success rate thresholds (percentage)
  successRate: {
    excellent: number;    // > 99%
    good: number;         // > 95%
    acceptable: number;   // > 90%
    poor: number;         // > 80%
    // < poor = critical
  };
  
  // Block sync thresholds
  blockSync: {
    maxBlocksBehind: number;  // Maximum blocks behind before degraded
    syncCheckInterval: number; // How often to check sync status (ms)
  };
  
  // Failure thresholds
  failures: {
    maxConsecutive: number;   // Max consecutive failures before marked unhealthy
    degradationWindow: number; // Time window to analyze degradation (ms)
  };
}

/**
 * Connection Health Monitor - Advanced health scoring and predictive failure detection
 * 
 * This component provides sophisticated health monitoring beyond basic connectivity tests.
 * It implements multi-metric health scoring, sliding window performance analysis,
 * and predictive failure detection based on degrading patterns.
 * 
 * Features:
 * - Multi-metric health scoring (latency, reliability, sync, throughput)
 * - Sliding window performance analysis for trend detection
 * - Predictive failure detection based on degrading patterns
 * - Chain-specific health thresholds and scoring algorithms
 * - Historical performance tracking and analytics
 * - Real-time health dashboards and alerting integration
 */
export class ConnectionHealthMonitor {
  private providerMetrics: Map<string, ProviderHealthMetrics> = new Map();
  private healthHistory: Map<string, HealthCheckResult[]> = new Map();
  private isInitialized: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  // Configuration
  private readonly HEALTH_CHECK_INTERVAL = 15000; // 15 seconds
  private readonly HISTORY_RETENTION_SIZE = 100; // Keep last 100 health checks per provider
  private readonly SLIDING_WINDOW_SIZE = 20; // Last 20 checks for trend analysis
  private readonly RESPONSE_TIME_HISTORY_SIZE = 50; // Response time sliding window
  
  // Chain-specific health thresholds
  private healthThresholds: Map<number, HealthThresholds> = new Map();

  constructor() {
    this.initializeHealthThresholds();
  }

  /**
   * Initialize chain-specific health thresholds
   */
  private initializeHealthThresholds(): void {
    // Arbitrum thresholds - Fastest chain
    this.healthThresholds.set(42161, {
      responseTime: {
        excellent: 100,
        good: 300,
        acceptable: 800,
        poor: 2000
      },
      successRate: {
        excellent: 99.5,
        good: 98.0,
        acceptable: 95.0,
        poor: 90.0
      },
      blockSync: {
        maxBlocksBehind: 5,
        syncCheckInterval: 30000
      },
      failures: {
        maxConsecutive: 3,
        degradationWindow: 300000 // 5 minutes
      }
    });

    // Polygon thresholds - Medium performance expectations
    this.healthThresholds.set(137, {
      responseTime: {
        excellent: 150,
        good: 400,
        acceptable: 1000,
        poor: 3000
      },
      successRate: {
        excellent: 99.0,
        good: 97.0,
        acceptable: 94.0,
        poor: 88.0
      },
      blockSync: {
        maxBlocksBehind: 3,
        syncCheckInterval: 30000
      },
      failures: {
        maxConsecutive: 3,
        degradationWindow: 300000
      }
    });

    // Base thresholds - Good performance expectations
    this.healthThresholds.set(8453, {
      responseTime: {
        excellent: 120,
        good: 350,
        acceptable: 900,
        poor: 2500
      },
      successRate: {
        excellent: 99.2,
        good: 97.5,
        acceptable: 94.5,
        poor: 89.0
      },
      blockSync: {
        maxBlocksBehind: 3,
        syncCheckInterval: 30000
      },
      failures: {
        maxConsecutive: 3,
        degradationWindow: 300000
      }
    });
  }

  /**
   * Initialize the health monitor
   */
  async initialize(providerConfigs: Array<{
    name: string;
    chainId: number;
    priority: number;
  }>): Promise<void> {
    try {
      logger.startup('Initializing Connection Health Monitor...');

      // Initialize metrics for all providers
      for (const config of providerConfigs) {
        const providerKey = `${config.chainId}-${config.name}`;
        
        const metrics: ProviderHealthMetrics = {
          name: config.name,
          chainId: config.chainId,
          priority: config.priority,
          
          // Connectivity
          isHealthy: false,
          consecutiveFailures: 0,
          lastHealthCheck: 0,
          
          // Performance
          responseTime: 0,
          averageResponseTime: 0,
          responseTimeHistory: [],
          
          // Reliability
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          successRate: 0,
          
          // Advanced
          blockSyncStatus: {
            isInSync: true,
            blocksBehind: 0,
            lastSyncCheck: 0
          },
          
          // Health scoring
          healthScore: 0,
          degradationTrend: 'stable'
        };

        this.providerMetrics.set(providerKey, metrics);
        this.healthHistory.set(providerKey, []);
        
        logger.debug('Health monitor initialized for provider', {
          providerKey,
          chainId: config.chainId,
          providerName: config.name
        });
      }

      // Start continuous health monitoring
      this.startHealthMonitoring();

      this.isInitialized = true;
      logger.startup('Connection Health Monitor initialized successfully', {
        totalProviders: this.providerMetrics.size,
        chainsMonitored: new Set(Array.from(this.providerMetrics.values()).map(m => m.chainId)).size
      });

    } catch (error) {
      logger.error('Failed to initialize Connection Health Monitor', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Start continuous health monitoring
   */
  private startHealthMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);
    
    logger.info('Health monitoring started', { 
      interval: `${this.HEALTH_CHECK_INTERVAL}ms`,
      providers: this.providerMetrics.size 
    });
  }

  /**
   * Perform health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises: Promise<void>[] = [];

    for (const [providerKey, metrics] of this.providerMetrics) {
      healthCheckPromises.push(this.performProviderHealthCheck(providerKey, metrics));
    }

    await Promise.allSettled(healthCheckPromises);

    // Update health scores after all checks complete
    this.updateHealthScores();
    
    // Log summary if any providers are degraded
    this.logHealthSummary();
  }

  /**
   * Perform health check on a specific provider
   */
  private async performProviderHealthCheck(providerKey: string, metrics: ProviderHealthMetrics): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Import RPC Provider Manager dynamically to avoid circular dependency
      const { rpcProviderManager } = await import('./RpcProviderManager.js');
      
      const client = rpcProviderManager.getHttpProvider(metrics.chainId);
      
      // Perform basic connectivity and block number test
      const blockNumber = await client.getBlockNumber();
      const responseTime = Date.now() - startTime;
      
      // Update success metrics
      metrics.totalRequests++;
      metrics.successfulRequests++;
      metrics.consecutiveFailures = 0;
      metrics.isHealthy = true;
      metrics.lastHealthCheck = Date.now();
      
      // Update response time metrics
      this.updateResponseTimeMetrics(metrics, responseTime);
      
      // Check block sync status
      await this.checkBlockSyncStatus(metrics, blockNumber);
      
      // Record successful health check
      const healthResult: HealthCheckResult = {
        provider: metrics.name,
        chainId: metrics.chainId,
        success: true,
        responseTime,
        blockNumber,
        timestamp: Date.now()
      };
      
      this.addToHealthHistory(providerKey, healthResult);
      
      logger.debug('Provider health check successful', {
        provider: metrics.name,
        chainId: metrics.chainId,
        responseTime,
        blockNumber: blockNumber.toString()
      });

    } catch (error) {
      // Update failure metrics
      metrics.totalRequests++;
      metrics.failedRequests++;
      metrics.consecutiveFailures++;
      metrics.isHealthy = false;
      metrics.lastHealthCheck = Date.now();
      
      const responseTime = Date.now() - startTime;
      
      // Record failed health check
      const healthResult: HealthCheckResult = {
        provider: metrics.name,
        chainId: metrics.chainId,
        success: false,
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      };
      
      this.addToHealthHistory(providerKey, healthResult);
      
      logger.warn('Provider health check failed', {
        provider: metrics.name,
        chainId: metrics.chainId,
        consecutiveFailures: metrics.consecutiveFailures,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    
    // Update success rate
    metrics.successRate = (metrics.successfulRequests / metrics.totalRequests) * 100;
  }

  /**
   * Update response time metrics with sliding window
   */
  private updateResponseTimeMetrics(metrics: ProviderHealthMetrics, responseTime: number): void {
    metrics.responseTime = responseTime;
    metrics.responseTimeHistory.push(responseTime);
    
    // Maintain sliding window
    if (metrics.responseTimeHistory.length > this.RESPONSE_TIME_HISTORY_SIZE) {
      metrics.responseTimeHistory.shift();
    }
    
    // Calculate average response time
    metrics.averageResponseTime = metrics.responseTimeHistory.reduce((sum, rt) => sum + rt, 0) / metrics.responseTimeHistory.length;
  }

  /**
   * Check block synchronization status
   */
  private async checkBlockSyncStatus(metrics: ProviderHealthMetrics, currentBlock: bigint): Promise<void> {
    const now = Date.now();
    const thresholds = this.healthThresholds.get(metrics.chainId);
    
    if (!thresholds || (now - metrics.blockSyncStatus.lastSyncCheck) < thresholds.blockSync.syncCheckInterval) {
      return; // Skip sync check if too soon
    }

    try {
      // Get cached block data from other providers to compare
      const latestKnownBlock = await this.getLatestKnownBlock(metrics.chainId);
      
      if (latestKnownBlock) {
        const blocksBehind = Number(latestKnownBlock - currentBlock);
        metrics.blockSyncStatus.blocksBehind = Math.max(0, blocksBehind);
        metrics.blockSyncStatus.isInSync = blocksBehind <= thresholds.blockSync.maxBlocksBehind;
        
        if (!metrics.blockSyncStatus.isInSync) {
          logger.warn('Provider out of sync', {
            provider: metrics.name,
            chainId: metrics.chainId,
            currentBlock: currentBlock.toString(),
            latestKnownBlock: latestKnownBlock.toString(),
            blocksBehind
          });
        }
      }
      
      metrics.blockSyncStatus.lastSyncCheck = now;

    } catch (error) {
      logger.debug('Failed to check block sync status', {
        provider: metrics.name,
        chainId: metrics.chainId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get latest known block for a chain from Redis cache
   */
  private async getLatestKnownBlock(chainId: number): Promise<bigint | null> {
    try {
      if (!redisCache.isHealthy()) {
        return null;
      }

      const cachedBlock = await redisCache.get<any>(`latest_block:${chainId}`);
      if (cachedBlock && cachedBlock.blockNumber) {
        return BigInt(cachedBlock.blockNumber);
      }
      
      return null;
    } catch (error) {
      logger.debug('Failed to get latest known block from cache', {
        chainId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  /**
   * Add health check result to history with retention
   */
  private addToHealthHistory(providerKey: string, result: HealthCheckResult): void {
    const history = this.healthHistory.get(providerKey);
    if (!history) {
      return;
    }

    history.push(result);
    
    // Maintain history size
    if (history.length > this.HISTORY_RETENTION_SIZE) {
      history.shift();
    }
  }

  /**
   * Update health scores for all providers
   */
  private updateHealthScores(): void {
    for (const [providerKey, metrics] of this.providerMetrics) {
      const score = this.calculateHealthScore(metrics);
      const trend = this.calculateDegradationTrend(providerKey);
      
      metrics.healthScore = score;
      metrics.degradationTrend = trend;
    }
  }

  /**
   * Calculate comprehensive health score (0-100)
   */
  private calculateHealthScore(metrics: ProviderHealthMetrics): number {
    const thresholds = this.healthThresholds.get(metrics.chainId);
    if (!thresholds) {
      return 0;
    }

    let score = 0;
    const weights = {
      connectivity: 0.3,    // 30% - Basic connectivity
      responseTime: 0.25,   // 25% - Performance
      successRate: 0.25,    // 25% - Reliability  
      blockSync: 0.2        // 20% - Synchronization
    };

    // 1. Connectivity Score (0-30 points)
    if (metrics.isHealthy) {
      score += weights.connectivity * 100;
      
      // Penalize for consecutive failures
      if (metrics.consecutiveFailures > 0) {
        const penalty = Math.min(metrics.consecutiveFailures * 5, 15); // Max 15 point penalty
        score -= penalty;
      }
    }

    // 2. Response Time Score (0-25 points)
    const avgResponseTime = metrics.averageResponseTime || metrics.responseTime;
    let responseScore = 0;
    
    if (avgResponseTime <= thresholds.responseTime.excellent) {
      responseScore = 100;
    } else if (avgResponseTime <= thresholds.responseTime.good) {
      responseScore = 85;
    } else if (avgResponseTime <= thresholds.responseTime.acceptable) {
      responseScore = 70;
    } else if (avgResponseTime <= thresholds.responseTime.poor) {
      responseScore = 50;
    } else {
      responseScore = 20; // Critical response time
    }
    
    score += weights.responseTime * responseScore;

    // 3. Success Rate Score (0-25 points)
    let reliabilityScore = 0;
    
    if (metrics.successRate >= thresholds.successRate.excellent) {
      reliabilityScore = 100;
    } else if (metrics.successRate >= thresholds.successRate.good) {
      reliabilityScore = 85;
    } else if (metrics.successRate >= thresholds.successRate.acceptable) {
      reliabilityScore = 70;
    } else if (metrics.successRate >= thresholds.successRate.poor) {
      reliabilityScore = 50;
    } else {
      reliabilityScore = 20; // Critical reliability
    }
    
    score += weights.successRate * reliabilityScore;

    // 4. Block Sync Score (0-20 points)
    let syncScore = 0;
    
    if (metrics.blockSyncStatus.isInSync) {
      syncScore = 100;
    } else {
      // Gradual degradation based on blocks behind
      const blocksBehind = metrics.blockSyncStatus.blocksBehind;
      const maxBehind = thresholds.blockSync.maxBlocksBehind;
      
      if (blocksBehind <= maxBehind * 2) {
        syncScore = 60; // Moderately behind
      } else if (blocksBehind <= maxBehind * 5) {
        syncScore = 30; // Significantly behind
      } else {
        syncScore = 10; // Critically behind
      }
    }
    
    score += weights.blockSync * syncScore;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate degradation trend based on recent history
   */
  private calculateDegradationTrend(providerKey: string): 'improving' | 'stable' | 'degrading' | 'critical' {
    const history = this.healthHistory.get(providerKey);
    if (!history || history.length < this.SLIDING_WINDOW_SIZE) {
      return 'stable';
    }

    const recentHistory = history.slice(-this.SLIDING_WINDOW_SIZE);
    const halfPoint = Math.floor(recentHistory.length / 2);
    
    const firstHalf = recentHistory.slice(0, halfPoint);
    const secondHalf = recentHistory.slice(halfPoint);
    
    // Calculate success rates for each half
    const firstHalfSuccessRate = (firstHalf.filter(h => h.success).length / firstHalf.length) * 100;
    const secondHalfSuccessRate = (secondHalf.filter(h => h.success).length / secondHalf.length) * 100;
    
    // Calculate average response times for each half
    const firstHalfAvgResponse = firstHalf.reduce((sum, h) => sum + h.responseTime, 0) / firstHalf.length;
    const secondHalfAvgResponse = secondHalf.reduce((sum, h) => sum + h.responseTime, 0) / secondHalf.length;
    
    // Determine trend
    const successRateDelta = secondHalfSuccessRate - firstHalfSuccessRate;
    const responseTimeDelta = secondHalfAvgResponse - firstHalfAvgResponse;
    
    // Critical: Success rate dropped significantly or response time increased dramatically
    if (successRateDelta < -20 || responseTimeDelta > 2000) {
      return 'critical';
    }
    
    // Degrading: Success rate dropping or response time increasing
    if (successRateDelta < -5 || responseTimeDelta > 500) {
      return 'degrading';
    }
    
    // Improving: Success rate increasing and response time decreasing
    if (successRateDelta > 5 && responseTimeDelta < -200) {
      return 'improving';
    }
    
    return 'stable';
  }

  /**
   * Log health summary for degraded providers
   */
  private logHealthSummary(): void {
    const degradedProviders = Array.from(this.providerMetrics.values())
      .filter(metrics => metrics.healthScore < 80 || metrics.degradationTrend === 'degrading' || metrics.degradationTrend === 'critical');

    if (degradedProviders.length > 0) {
      logger.warn('Providers with degraded health detected', {
        degradedCount: degradedProviders.length,
        totalProviders: this.providerMetrics.size,
        providers: degradedProviders.map(p => ({
          name: p.name,
          chainId: p.chainId,
          healthScore: p.healthScore,
          trend: p.degradationTrend,
          successRate: Math.round(p.successRate * 10) / 10,
          avgResponseTime: Math.round(p.averageResponseTime)
        }))
      });
    }
  }

  /**
   * Get health metrics for a specific provider
   */
  getProviderHealthMetrics(chainId: number, providerName: string): ProviderHealthMetrics | null {
    const providerKey = `${chainId}-${providerName}`;
    return this.providerMetrics.get(providerKey) || null;
  }

  /**
   * Get health status for all providers on a chain
   */
  getChainHealthStatus(chainId: number): ChainHealthStatus | null {
    const chainProviders = Array.from(this.providerMetrics.values())
      .filter(metrics => metrics.chainId === chainId);

    if (chainProviders.length === 0) {
      return null;
    }

    const healthyProviders = chainProviders.filter(p => p.isHealthy && p.healthScore >= 80);
    const degradedProviders = chainProviders.filter(p => p.isHealthy && p.healthScore < 80 && p.healthScore >= 50);
    const failedProviders = chainProviders.filter(p => !p.isHealthy || p.healthScore < 50);

    // Find best provider (highest health score among healthy providers)
    const bestProvider = healthyProviders.length > 0 
      ? healthyProviders.reduce((best, current) => 
          current.healthScore > best.healthScore ? current : best
        ).name
      : 'none';

    // Calculate overall health score (weighted average by priority)
    const totalWeight = chainProviders.reduce((sum, p) => sum + (1 / p.priority), 0);
    const weightedScore = chainProviders.reduce((sum, p) => 
      sum + (p.healthScore * (1 / p.priority)), 0
    );
    const overallHealthScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

    // Determine recommended action
    let recommendedAction: ChainHealthStatus['recommendedAction'] = 'continue';
    
    if (failedProviders.length >= chainProviders.length * 0.5) {
      recommendedAction = 'alert_ops'; // >50% providers failed
    } else if (degradedProviders.length >= chainProviders.length * 0.3) {
      recommendedAction = 'reduce_load'; // >30% providers degraded
    } else if (healthyProviders.length > 0 && bestProvider !== chainProviders[0]?.name) {
      recommendedAction = 'switch_provider'; // Better provider available
    }

    // Get chain name from first provider
    const chainName = chainProviders[0]?.name ? 
      (chainId === 42161 ? 'Arbitrum One' : chainId === 137 ? 'Polygon' : chainId === 8453 ? 'Base' : `Chain ${chainId}`) : 
      `Chain ${chainId}`;

    return {
      chainId,
      chainName,
      totalProviders: chainProviders.length,
      healthyProviders: healthyProviders.length,
      degradedProviders: degradedProviders.length,
      failedProviders: failedProviders.length,
      bestProvider,
      overallHealthScore,
      recommendedAction
    };
  }

  /**
   * Get all provider health metrics
   */
  getAllProviderMetrics(): ProviderHealthMetrics[] {
    return Array.from(this.providerMetrics.values());
  }

  /**
   * Get health history for a provider
   */
  getProviderHealthHistory(chainId: number, providerName: string): HealthCheckResult[] {
    const providerKey = `${chainId}-${providerName}`;
    return this.healthHistory.get(providerKey) || [];
  }

  /**
   * Perform predictive failure analysis
   */
  predictProviderFailure(chainId: number, providerName: string): {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    timeToFailure?: number; // Estimated milliseconds until failure
    reasons: string[];
  } {
    const metrics = this.getProviderHealthMetrics(chainId, providerName);
    if (!metrics) {
      return { riskLevel: 'critical', confidence: 0, reasons: ['Provider not found'] };
    }

    const reasons: string[] = [];
    let riskScore = 0;
    let confidence = 0;

    // Analyze degradation trend
    if (metrics.degradationTrend === 'critical') {
      riskScore += 40;
      reasons.push('Critical degradation trend detected');
    } else if (metrics.degradationTrend === 'degrading') {
      riskScore += 25;
      reasons.push('Performance degradation observed');
    }

    // Analyze consecutive failures
    if (metrics.consecutiveFailures >= 2) {
      riskScore += 30;
      reasons.push(`${metrics.consecutiveFailures} consecutive failures`);
    }

    // Analyze health score
    if (metrics.healthScore < 30) {
      riskScore += 35;
      reasons.push('Health score critically low');
    } else if (metrics.healthScore < 60) {
      riskScore += 20;
      reasons.push('Health score below acceptable threshold');
    }

    // Analyze success rate trend
    if (metrics.successRate < 80) {
      riskScore += 25;
      reasons.push('Success rate below 80%');
    }

    // Analyze response time trend
    const thresholds = this.healthThresholds.get(chainId);
    if (thresholds && metrics.averageResponseTime > thresholds.responseTime.poor) {
      riskScore += 20;
      reasons.push('Response time consistently poor');
    }

    // Analyze block sync status
    if (!metrics.blockSyncStatus.isInSync) {
      riskScore += 15;
      reasons.push(`${metrics.blockSyncStatus.blocksBehind} blocks behind`);
    }

    // Calculate confidence based on data availability
    const historyKey = `${chainId}-${providerName}`;
    const history = this.healthHistory.get(historyKey);
    const dataPoints = history?.length || 0;
    
    if (dataPoints >= this.SLIDING_WINDOW_SIZE) {
      confidence = Math.min(95, 60 + (dataPoints - this.SLIDING_WINDOW_SIZE) * 2);
    } else {
      confidence = Math.max(30, dataPoints * 3);
    }

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 80) {
      riskLevel = 'critical';
    } else if (riskScore >= 60) {
      riskLevel = 'high';
    } else if (riskScore >= 30) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    // Estimate time to failure for high-risk providers
    let timeToFailure: number | undefined;
    if (riskLevel === 'high' || riskLevel === 'critical') {
      const failureRate = (100 - metrics.successRate) / 100;
      const avgCheckInterval = this.HEALTH_CHECK_INTERVAL;
      
      // Rough estimation based on current failure rate
      timeToFailure = Math.max(
        avgCheckInterval,
        avgCheckInterval / Math.max(failureRate, 0.01)
      );
    }

    return {
      riskLevel,
      confidence: Math.round(confidence),
      ...(timeToFailure !== undefined && { timeToFailure }),
      reasons
    };
  }

  /**
   * Check if health monitor is operational
   */
  isHealthy(): boolean {
    return this.isInitialized; // Healthy if initialized, even with empty config
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.shutdown('Shutting down Connection Health Monitor...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.isInitialized = false;
    logger.shutdown('Connection Health Monitor shutdown complete');
  }
}

// Export singleton instance
export const connectionHealthMonitor = new ConnectionHealthMonitor();
