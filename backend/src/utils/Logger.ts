import pino, { Logger as PinoLogger } from 'pino';
import { pinoConfig } from '../../logging.config.js';

/**
 * Logger Wrapper for Flash Arbitrage Bot
 */

// Create the logger with custom levels
const pinoLogger = pino(pinoConfig);

class Logger {
  private static instance: Logger;
  private logger: typeof pinoLogger;

  constructor() {
    this.logger = pinoLogger;
  }

  /**
   * Get singleton instance of Logger
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Standard pino log levels
  debug(message: string, meta?: object): void {
    this.logger.debug(meta, message);
  }

  info(message: string, meta?: object): void {
    this.logger.info(meta, message);
  }

  warn(message: string, meta?: object): void {
    this.logger.warn(meta, message);
  }

  error(message: string, error?: Error | object, meta?: object): void {
    if (error instanceof Error) {
      this.logger.error({ error, ...meta }, message);
    } else {
      this.logger.error({ ...error, ...meta }, message);
    }
  }

  fatal(message: string, error?: Error | object, meta?: object): void {
    if (error instanceof Error) {
      this.logger.fatal({ error, ...meta }, message);
    } else {
      this.logger.fatal({ ...error, ...meta }, message);
    }
  }

  // Custom level methods - access the custom levels directly
  price(message: string, priceData?: object): void {
    (this.logger as any).price(
      {
        type: 'PRICE',
        ...priceData,
      },
      `${message}`
    );
  }

  opportunity(message: string, opportunityData?: object): void {
    (this.logger as any).opportunity(
      {
        type: 'OPPORTUNITY',
        ...opportunityData,
      },
      `${message}`
    );
  }

  trade(message: string, tradeData?: object): void {
    (this.logger as any).trade(
      {
        type: 'TRADE',
        ...tradeData,
      },
      `${message}`
    );
  }

  // Other methods
  gas(message: string, gasData?: object): void {
    this.logger.debug({ type: 'GAS', ...gasData }, `[GAS] ${message}`);
  }

  connection(message: string, connectionData?: object): void {
    this.logger.info({ type: 'CONNECTION', ...connectionData }, `[CONNECTION] ${message}`);
  }

  performance(message: string, perfData?: object): void {
    this.logger.debug({ type: 'PERFORMANCE', ...perfData }, `[PERF] ${message}`);
  }

  startup(message: string, startupData?: object): void {
    this.logger.info({ type: 'STARTUP', ...startupData }, `[STARTUP] ${message}`);
  }

  shutdown(message: string, shutdownData?: object): void {
    this.logger.info({ type: 'SHUTDOWN', ...shutdownData }, `[SHUTDOWN] ${message}`);
  }

  child(bindings: object): Logger {
    const childLogger = new Logger();
    childLogger.logger = this.logger.child(bindings);
    return childLogger;
  }

  raw(): PinoLogger {
    return this.logger;
  }

  // ================================
  // PHASE 2 ENHANCEMENTS - Specialized Health Monitoring Logging
  // ================================

  /**
   * Log provider health status changes
   */
  providerHealth(message: string, healthData: {
    chainId: number;
    providerName: string;
    healthScore?: number;
    isHealthy?: boolean;
    degradationTrend?: string;
    responseTime?: number;
    successRate?: number;
    consecutiveFailures?: number;
  }): void {
    this.logger.info({ 
      type: 'PROVIDER_HEALTH', 
      ...healthData 
    }, `[PROVIDER_HEALTH] ${message}`);
  }

  /**
   * Log circuit breaker events
   */
  circuitBreaker(message: string, circuitData: {
    chainId: number;
    providerName: string;
    event: 'opened' | 'closed' | 'half_open';
    failureCount?: number;
    reason?: string;
  }): void {
    const logLevel = circuitData.event === 'opened' ? 'warn' : 'info';
    this.logger[logLevel]({ 
      type: 'CIRCUIT_BREAKER', 
      ...circuitData 
    }, `[CIRCUIT_BREAKER] ${message}`);
  }

  /**
   * Log failover events
   */
  failover(message: string, failoverData: {
    chainId: number;
    fromProvider: string;
    toProvider: string;
    reason: string;
    switchLatency?: number;
    success: boolean;
    triggerRule?: string;
  }): void {
    const logLevel = failoverData.success ? 'info' : 'error';
    this.logger[logLevel]({ 
      type: 'FAILOVER', 
      ...failoverData 
    }, `[FAILOVER] ${message}`);
  }

  /**
   * Log load balancing decisions
   */
  loadBalancing(message: string, loadData: {
    chainId: number;
    strategy: string;
    selectedProvider: string;
    loadScore?: number;
    activeRequests?: number;
    requestsPerSecond?: number;
    alternatives?: string[];
  }): void {
    this.logger.debug({ 
      type: 'LOAD_BALANCING', 
      ...loadData 
    }, `[LOAD_BALANCING] ${message}`);
  }

  /**
   * Log WebSocket connection events
   */
  websocket(message: string, wsData: {
    chainId: number;
    event: 'connected' | 'disconnected' | 'error' | 'reconnecting';
    provider?: string;
    blockNumber?: string;
    consecutiveFailures?: number;
    reconnectDelay?: number;
  }): void {
    const logLevel = wsData.event === 'error' || wsData.event === 'disconnected' ? 'warn' : 'info';
    this.logger[logLevel]({ 
      type: 'WEBSOCKET', 
      ...wsData 
    }, `[WEBSOCKET] ${message}`);
  }

  /**
   * Log health monitoring metrics
   */
  healthMetrics(message: string, metricsData: {
    chainId: number;
    providerName: string;
    metrics: {
      responseTime: number;
      successRate: number;
      healthScore: number;
      degradationTrend: string;
      blocksBehind?: number;
    };
  }): void {
    this.logger.debug({ 
      type: 'HEALTH_METRICS', 
      ...metricsData 
    }, `[HEALTH_METRICS] ${message}`);
  }

  /**
   * Log predictive failure analysis
   */
  predictiveAnalysis(message: string, predictionData: {
    chainId: number;
    providerName: string;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    confidence: number;
    timeToFailure?: number;
    reasons: string[];
  }): void {
    const logLevel = predictionData.riskLevel === 'critical' ? 'error' : 
                    predictionData.riskLevel === 'high' ? 'warn' : 'info';
    this.logger[logLevel]({ 
      type: 'PREDICTIVE_ANALYSIS', 
      ...predictionData 
    }, `[PREDICTIVE_ANALYSIS] ${message}`);
  }

  /**
   * Log operations alerts
   */
  operationsAlert(message: string, alertData: {
    chainId: number;
    severity: 'info' | 'warning' | 'critical';
    component: string;
    details: object;
    actionRequired?: boolean;
  }): void {
    const logLevel = alertData.severity === 'critical' ? 'error' : 
                    alertData.severity === 'warning' ? 'warn' : 'info';
    this.logger[logLevel]({ 
      type: 'OPERATIONS_ALERT', 
      ...alertData 
    }, `[OPERATIONS_ALERT] ${message}`);
  }

  /**
   * Log provider state changes
   */
  providerState(message: string, stateData: {
    chainId: number;
    providerName: string;
    oldState: string;
    newState: string;
    reason?: string;
    duration?: number;
  }): void {
    this.logger.info({ 
      type: 'PROVIDER_STATE', 
      ...stateData 
    }, `[PROVIDER_STATE] ${message}`);
  }

  /**
   * Log health check results in batch
   */
  healthCheckBatch(message: string, batchData: {
    totalProviders: number;
    healthyProviders: number;
    degradedProviders: number;
    failedProviders: number;
    averageResponseTime: number;
    chains: Array<{
      chainId: number;
      healthyCount: number;
      totalCount: number;
    }>;
  }): void {
    this.logger.debug({ 
      type: 'HEALTH_CHECK_BATCH', 
      ...batchData 
    }, `[HEALTH_CHECK_BATCH] ${message}`);
  }

  /**
   * Log monitoring system performance
   */
  monitoringPerformance(message: string, perfData: {
    component: string;
    operation: string;
    duration: number;
    success: boolean;
    dataPoints?: number;
    memoryUsage?: number;
  }): void {
    this.logger.debug({ 
      type: 'MONITORING_PERFORMANCE', 
      ...perfData 
    }, `[MONITORING_PERFORMANCE] ${message}`);
  }

  /**
   * Log advanced monitoring system events
   */
  monitoringSystem(message: string, systemData: {
    event: 'initialized' | 'shutdown' | 'error' | 'warning';
    component: string;
    details?: object;
    duration?: number;
  }): void {
    const logLevel = systemData.event === 'error' ? 'error' : 
                    systemData.event === 'warning' ? 'warn' : 'info';
    this.logger[logLevel]({ 
      type: 'MONITORING_SYSTEM', 
      ...systemData 
    }, `[MONITORING_SYSTEM] ${message}`);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export class
export { Logger };
