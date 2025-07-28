import { Pool } from 'pg';
import { logger } from '../utils/Logger.js';

// Database interfaces for type safety
export interface TradeRecord {
  id?: string;
  timestamp?: Date;
  chain: string;
  tokenA: string;
  tokenB: string;
  dexA: string;
  dexB: string;
  amountIn: string;
  amountOut: string;
  gasUsed?: string;
  profit: string;
  status: 'success' | 'failed' | 'pending';
  txHash?: string;
  errorMessage?: string;
}

export interface OpportunityRecord {
  id?: string;
  timestamp?: Date;
  chain: string;
  tokenPair: string;
  dexA: string;
  dexB: string;
  estimatedProfit: string;
  executed: boolean;
  rejectionReason?: string;
}

export interface SystemMetric {
  id?: string;
  timestamp?: Date;
  metricName: string;
  metricValue: number;
  tags?: Record<string, any>;
}

export interface PerformanceStats {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  successRate: number;
  totalProfit: string;
  averageProfit: string;
  totalGasUsed: string;
  averageGasUsed: string;
  totalOpportunities: number;
  executedOpportunities: number;
  executionRate: number;
}

export interface TradeFilters {
  chain?: string;
  status?: 'success' | 'failed' | 'pending';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface OpportunityFilters {
  chain?: string;
  executed?: boolean;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export class PostgresRepository {
  private pool: Pool;
  private isConnected: boolean = false;

  constructor() {
    this.pool = this.createPool();
    this.setupEventHandlers();
  }

  private createPool(): Pool {
    // Validate required environment variables
    const requiredEnvVars = ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_APP_DB', 'POSTGRES_APP_USER', 'POSTGRES_APP_PASSWORD'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`${envVar} environment variable is required`);
      }
    }

    return new Pool({
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_APP_DB,
      user: process.env.POSTGRES_APP_USER,
      password: process.env.POSTGRES_APP_PASSWORD,
      max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS || '20'),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  }

  private setupEventHandlers(): void {
    this.pool.on('connect', () => {
      logger.info('PostgreSQL client connected');
      this.isConnected = true;
    });

    this.pool.on('error', (err) => {
      logger.error('PostgreSQL pool error', { error: err.message });
      this.isConnected = false;
    });

    this.pool.on('remove', () => {
      logger.debug('PostgreSQL client removed from pool');
    });
  }

  async connect(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      logger.info('PostgreSQL repository initialized successfully');
    } catch (error) {
      logger.error('Failed to connect to PostgreSQL', { error });
      throw new Error(`PostgreSQL connection failed: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.pool.end();
      this.isConnected = false;
      logger.info('PostgreSQL pool closed gracefully');
    } catch (error) {
      logger.error('Error closing PostgreSQL pool', { error });
    }
  }

  isHealthy(): boolean {
    return this.isConnected && this.pool.totalCount >= 0;
  }

  async createTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Trades table
      await client.query(`
        CREATE TABLE IF NOT EXISTS trades (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          chain VARCHAR(20) NOT NULL,
          token_a VARCHAR(42) NOT NULL,
          token_b VARCHAR(42) NOT NULL,
          dex_a VARCHAR(50) NOT NULL,
          dex_b VARCHAR(50) NOT NULL,
          amount_in DECIMAL(78,0) NOT NULL,
          amount_out DECIMAL(78,0) NOT NULL,
          gas_used DECIMAL(78,0),
          profit DECIMAL(78,0) NOT NULL,
          status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
          tx_hash VARCHAR(66),
          error_message TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Opportunities table
      await client.query(`
        CREATE TABLE IF NOT EXISTS opportunities (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          chain VARCHAR(20) NOT NULL,
          token_pair VARCHAR(100) NOT NULL,
          dex_a VARCHAR(50) NOT NULL,
          dex_b VARCHAR(50) NOT NULL,
          estimated_profit DECIMAL(78,0) NOT NULL,
          executed BOOLEAN DEFAULT FALSE,
          rejection_reason TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // System metrics table
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_metrics (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          metric_name VARCHAR(100) NOT NULL,
          metric_value DECIMAL(20,8) NOT NULL,
          tags JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_trades_chain ON trades (chain);
        CREATE INDEX IF NOT EXISTS idx_trades_status ON trades (status);
        CREATE INDEX IF NOT EXISTS idx_trades_tx_hash ON trades (tx_hash);
        
        CREATE INDEX IF NOT EXISTS idx_opportunities_timestamp ON opportunities (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_opportunities_chain ON opportunities (chain);
        CREATE INDEX IF NOT EXISTS idx_opportunities_executed ON opportunities (executed);
        
        CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics (metric_name);
      `);

      await client.query('COMMIT');
      logger.info('Database tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create database tables', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  // Trade operations
  async logTrade(trade: TradeRecord): Promise<string> {
    const query = `
      INSERT INTO trades (timestamp, chain, token_a, token_b, dex_a, dex_b, amount_in, amount_out, gas_used, profit, status, tx_hash, error_message)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;
    
    const values = [
      trade.timestamp || new Date(),
      trade.chain,
      trade.tokenA,
      trade.tokenB,
      trade.dexA,
      trade.dexB,
      trade.amountIn,
      trade.amountOut,
      trade.gasUsed || null,
      trade.profit,
      trade.status,
      trade.txHash || null,
      trade.errorMessage || null,
    ];

    try {
      const result = await this.pool.query(query, values);
      const tradeId = result.rows[0].id;
      
      logger.info('Trade logged successfully', { 
        tradeId, 
        chain: trade.chain, 
        status: trade.status,
        profit: trade.profit 
      });
      
      return tradeId;
    } catch (error) {
      logger.error('Failed to log trade', { trade, error });
      throw error;
    }
  }

  async getTradeHistory(filters: TradeFilters = {}): Promise<TradeRecord[]> {
    let query = `
      SELECT id, timestamp, chain, token_a as "tokenA", token_b as "tokenB", 
             dex_a as "dexA", dex_b as "dexB", amount_in as "amountIn", 
             amount_out as "amountOut", gas_used as "gasUsed", profit, 
             status, tx_hash as "txHash", error_message as "errorMessage"
      FROM trades
      WHERE 1=1
    `;
    
    const values: any[] = [];
    let paramCount = 0;

    if (filters.chain) {
      query += ` AND chain = $${++paramCount}`;
      values.push(filters.chain);
    }

    if (filters.status) {
      query += ` AND status = $${++paramCount}`;
      values.push(filters.status);
    }

    if (filters.startDate) {
      query += ` AND timestamp >= $${++paramCount}`;
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND timestamp <= $${++paramCount}`;
      values.push(filters.endDate);
    }

    query += ` ORDER BY timestamp DESC`;

    if (filters.limit) {
      query += ` LIMIT $${++paramCount}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${++paramCount}`;
      values.push(filters.offset);
    }

    try {
      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get trade history', { filters, error });
      throw error;
    }
  }

  // Opportunity operations
  async logOpportunity(opportunity: OpportunityRecord): Promise<string> {
    const query = `
      INSERT INTO opportunities (timestamp, chain, token_pair, dex_a, dex_b, estimated_profit, executed, rejection_reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    
    const values = [
      opportunity.timestamp || new Date(),
      opportunity.chain,
      opportunity.tokenPair,
      opportunity.dexA,
      opportunity.dexB,
      opportunity.estimatedProfit,
      opportunity.executed,
      opportunity.rejectionReason || null,
    ];

    try {
      const result = await this.pool.query(query, values);
      const opportunityId = result.rows[0].id;
      
      logger.debug('Opportunity logged', { 
        opportunityId, 
        chain: opportunity.chain,
        executed: opportunity.executed,
        estimatedProfit: opportunity.estimatedProfit 
      });
      
      return opportunityId;
    } catch (error) {
      logger.error('Failed to log opportunity', { opportunity, error });
      throw error;
    }
  }

  async getOpportunityHistory(filters: OpportunityFilters = {}): Promise<OpportunityRecord[]> {
    let query = `
      SELECT id, timestamp, chain, token_pair as "tokenPair", dex_a as "dexA", 
             dex_b as "dexB", estimated_profit as "estimatedProfit", 
             executed, rejection_reason as "rejectionReason"
      FROM opportunities
      WHERE 1=1
    `;
    
    const values: any[] = [];
    let paramCount = 0;

    if (filters.chain) {
      query += ` AND chain = $${++paramCount}`;
      values.push(filters.chain);
    }

    if (filters.executed !== undefined) {
      query += ` AND executed = $${++paramCount}`;
      values.push(filters.executed);
    }

    if (filters.startDate) {
      query += ` AND timestamp >= $${++paramCount}`;
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND timestamp <= $${++paramCount}`;
      values.push(filters.endDate);
    }

    query += ` ORDER BY timestamp DESC`;

    if (filters.limit) {
      query += ` LIMIT $${++paramCount}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${++paramCount}`;
      values.push(filters.offset);
    }

    try {
      const result = await this.pool.query(query, values);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get opportunity history', { filters, error });
      throw error;
    }
  }

  // System metrics operations
  async logSystemMetric(metric: SystemMetric): Promise<void> {
    const query = `
      INSERT INTO system_metrics (timestamp, metric_name, metric_value, tags)
      VALUES ($1, $2, $3, $4)
    `;
    
    const values = [
      metric.timestamp || new Date(),
      metric.metricName,
      metric.metricValue,
      metric.tags ? JSON.stringify(metric.tags) : null,
    ];

    try {
      await this.pool.query(query, values);
      logger.debug('System metric logged', { 
        metricName: metric.metricName, 
        metricValue: metric.metricValue 
      });
    } catch (error) {
      logger.error('Failed to log system metric', { metric, error });
      throw error;
    }
  }

  // Performance analytics
  async getPerformanceStats(startDate?: Date, endDate?: Date): Promise<PerformanceStats> {
    let dateFilter = '';
    const values: any[] = [];
    let paramCount = 0;

    if (startDate) {
      dateFilter += ` AND timestamp >= $${++paramCount}`;
      values.push(startDate);
    }

    if (endDate) {
      dateFilter += ` AND timestamp <= $${++paramCount}`;
      values.push(endDate);
    }

    try {
      // Trade statistics
      const tradeStatsQuery = `
        SELECT 
          COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE status = 'success') as successful_trades,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_trades,
          COALESCE(SUM(profit::DECIMAL), 0) as total_profit,
          COALESCE(AVG(profit::DECIMAL), 0) as average_profit,
          COALESCE(SUM(gas_used::DECIMAL), 0) as total_gas_used,
          COALESCE(AVG(gas_used::DECIMAL), 0) as average_gas_used
        FROM trades 
        WHERE 1=1 ${dateFilter}
      `;

      const tradeStatsResult = await this.pool.query(tradeStatsQuery, values);
      const tradeStats = tradeStatsResult.rows[0];

      // Opportunity statistics
      const opportunityStatsQuery = `
        SELECT 
          COUNT(*) as total_opportunities,
          COUNT(*) FILTER (WHERE executed = true) as executed_opportunities
        FROM opportunities 
        WHERE 1=1 ${dateFilter}
      `;

      const opportunityStatsResult = await this.pool.query(opportunityStatsQuery, values);
      const opportunityStats = opportunityStatsResult.rows[0];

      const totalTrades = parseInt(tradeStats.total_trades);
      const successfulTrades = parseInt(tradeStats.successful_trades);
      const totalOpportunities = parseInt(opportunityStats.total_opportunities);
      const executedOpportunities = parseInt(opportunityStats.executed_opportunities);

      return {
        totalTrades,
        successfulTrades,
        failedTrades: parseInt(tradeStats.failed_trades),
        successRate: totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0,
        totalProfit: tradeStats.total_profit.toString(),
        averageProfit: tradeStats.average_profit.toString(),
        totalGasUsed: tradeStats.total_gas_used.toString(),
        averageGasUsed: tradeStats.average_gas_used.toString(),
        totalOpportunities,
        executedOpportunities,
        executionRate: totalOpportunities > 0 ? (executedOpportunities / totalOpportunities) * 100 : 0,
      };
    } catch (error) {
      logger.error('Failed to get performance stats', { startDate, endDate, error });
      throw error;
    }
  }

  // Health check method for monitoring
  async ping(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rows.length === 1;
    } catch (error) {
      logger.error('PostgreSQL ping failed', { error });
      return false;
    }
  }

  // Database maintenance
  async getConnectionStats(): Promise<{
    totalConnections: number;
    idleConnections: number;
    waitingClients: number;
  }> {
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      waitingClients: this.pool.waitingCount,
    };
  }

  // ================================
  // PHASE 2 ENHANCEMENTS - Health Monitoring Tables
  // ================================

  /**
   * Create health monitoring tables
   */
  async createHealthMonitoringTables(): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Provider health events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS provider_health_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          chain_id INTEGER NOT NULL,
          provider_name VARCHAR(50) NOT NULL,
          health_score INTEGER NOT NULL,
          is_healthy BOOLEAN NOT NULL,
          consecutive_failures INTEGER NOT NULL,
          response_time INTEGER NOT NULL,
          success_rate DECIMAL(5,2) NOT NULL,
          degradation_trend VARCHAR(20) NOT NULL,
          block_sync_status JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Circuit breaker events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS circuit_breaker_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          chain_id INTEGER NOT NULL,
          provider_name VARCHAR(50) NOT NULL,
          event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('opened', 'closed', 'half_open')),
          failure_count INTEGER NOT NULL,
          trigger_reason TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Failover events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS failover_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          chain_id INTEGER NOT NULL,
          from_provider VARCHAR(50) NOT NULL,
          to_provider VARCHAR(50) NOT NULL,
          reason TEXT NOT NULL,
          trigger_rule VARCHAR(100),
          switch_latency INTEGER NOT NULL,
          success BOOLEAN NOT NULL,
          error_message TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Provider performance snapshots table
      await client.query(`
        CREATE TABLE IF NOT EXISTS provider_performance_snapshots (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          chain_id INTEGER NOT NULL,
          provider_name VARCHAR(50) NOT NULL,
          total_requests INTEGER NOT NULL,
          successful_requests INTEGER NOT NULL,
          failed_requests INTEGER NOT NULL,
          success_rate DECIMAL(5,2) NOT NULL,
          average_response_time INTEGER NOT NULL,
          load_score DECIMAL(8,2) NOT NULL,
          active_requests INTEGER NOT NULL,
          requests_per_second DECIMAL(8,2) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_provider_health_events_timestamp ON provider_health_events (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_provider_health_events_chain_provider ON provider_health_events (chain_id, provider_name);
        CREATE INDEX IF NOT EXISTS idx_provider_health_events_health_score ON provider_health_events (health_score);
        
        CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_timestamp ON circuit_breaker_events (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_chain_provider ON circuit_breaker_events (chain_id, provider_name);
        CREATE INDEX IF NOT EXISTS idx_circuit_breaker_events_type ON circuit_breaker_events (event_type);
        
        CREATE INDEX IF NOT EXISTS idx_failover_events_timestamp ON failover_events (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_failover_events_chain ON failover_events (chain_id);
        CREATE INDEX IF NOT EXISTS idx_failover_events_success ON failover_events (success);
        
        CREATE INDEX IF NOT EXISTS idx_provider_performance_timestamp ON provider_performance_snapshots (timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_provider_performance_chain_provider ON provider_performance_snapshots (chain_id, provider_name);
        CREATE INDEX IF NOT EXISTS idx_provider_performance_success_rate ON provider_performance_snapshots (success_rate);
      `);

      await client.query('COMMIT');
      logger.info('Health monitoring tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create health monitoring tables', { error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Log provider health event
   */
  async logProviderHealthEvent(event: {
    chainId: number;
    providerName: string;
    healthScore: number;
    isHealthy: boolean;
    consecutiveFailures: number;
    responseTime: number;
    successRate: number;
    degradationTrend: string;
    blockSyncStatus?: any;
    timestamp?: Date;
  }): Promise<string> {
    const query = `
      INSERT INTO provider_health_events (
        timestamp, chain_id, provider_name, health_score, is_healthy,
        consecutive_failures, response_time, success_rate, degradation_trend, block_sync_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
    `;
    
    const values = [
      event.timestamp || new Date(),
      event.chainId,
      event.providerName,
      event.healthScore,
      event.isHealthy,
      event.consecutiveFailures,
      event.responseTime,
      event.successRate,
      event.degradationTrend,
      event.blockSyncStatus ? JSON.stringify(event.blockSyncStatus) : null,
    ];

    try {
      const result = await this.pool.query(query, values);
      const eventId = result.rows[0].id;
      
      logger.debug('Provider health event logged', { 
        eventId, 
        chainId: event.chainId,
        providerName: event.providerName,
        healthScore: event.healthScore
      });
      
      return eventId;
    } catch (error) {
      logger.error('Failed to log provider health event', { event, error });
      throw error;
    }
  }

  /**
   * Log circuit breaker event
   */
  async logCircuitBreakerEvent(event: {
    chainId: number;
    providerName: string;
    eventType: 'opened' | 'closed' | 'half_open';
    failureCount: number;
    triggerReason?: string;
    timestamp?: Date;
  }): Promise<string> {
    const query = `
      INSERT INTO circuit_breaker_events (
        timestamp, chain_id, provider_name, event_type, failure_count, trigger_reason
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    
    const values = [
      event.timestamp || new Date(),
      event.chainId,
      event.providerName,
      event.eventType,
      event.failureCount,
      event.triggerReason || null,
    ];

    try {
      const result = await this.pool.query(query, values);
      const eventId = result.rows[0].id;
      
      logger.debug('Circuit breaker event logged', { 
        eventId, 
        chainId: event.chainId,
        providerName: event.providerName,
        eventType: event.eventType
      });
      
      return eventId;
    } catch (error) {
      logger.error('Failed to log circuit breaker event', { event, error });
      throw error;
    }
  }

  /**
   * Log failover event
   */
  async logFailoverEvent(event: {
    chainId: number;
    fromProvider: string;
    toProvider: string;
    reason: string;
    triggerRule?: string;
    switchLatency: number;
    success: boolean;
    errorMessage?: string;
    timestamp?: Date;
  }): Promise<string> {
    const query = `
      INSERT INTO failover_events (
        timestamp, chain_id, from_provider, to_provider, reason,
        trigger_rule, switch_latency, success, error_message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;
    
    const values = [
      event.timestamp || new Date(),
      event.chainId,
      event.fromProvider,
      event.toProvider,
      event.reason,
      event.triggerRule || null,
      event.switchLatency,
      event.success,
      event.errorMessage || null,
    ];

    try {
      const result = await this.pool.query(query, values);
      const eventId = result.rows[0].id;
      
      logger.info('Failover event logged', { 
        eventId, 
        chainId: event.chainId,
        fromProvider: event.fromProvider,
        toProvider: event.toProvider,
        success: event.success
      });
      
      return eventId;
    } catch (error) {
      logger.error('Failed to log failover event', { event, error });
      throw error;
    }
  }

  /**
   * Log provider performance snapshot
   */
  async logProviderPerformanceSnapshot(snapshot: {
    chainId: number;
    providerName: string;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successRate: number;
    averageResponseTime: number;
    loadScore: number;
    activeRequests: number;
    requestsPerSecond: number;
    timestamp?: Date;
  }): Promise<string> {
    const query = `
      INSERT INTO provider_performance_snapshots (
        timestamp, chain_id, provider_name, total_requests, successful_requests,
        failed_requests, success_rate, average_response_time, load_score,
        active_requests, requests_per_second
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `;
    
    const values = [
      snapshot.timestamp || new Date(),
      snapshot.chainId,
      snapshot.providerName,
      snapshot.totalRequests,
      snapshot.successfulRequests,
      snapshot.failedRequests,
      snapshot.successRate,
      snapshot.averageResponseTime,
      snapshot.loadScore,
      snapshot.activeRequests,
      snapshot.requestsPerSecond,
    ];

    try {
      const result = await this.pool.query(query, values);
      const snapshotId = result.rows[0].id;
      
      logger.debug('Provider performance snapshot logged', { 
        snapshotId, 
        chainId: snapshot.chainId,
        providerName: snapshot.providerName,
        successRate: snapshot.successRate
      });
      
      return snapshotId;
    } catch (error) {
      logger.error('Failed to log provider performance snapshot', { snapshot, error });
      throw error;
    }
  }

  /**
   * Get provider health history
   */
  async getProviderHealthHistory(chainId: number, providerName: string, hours: number = 24): Promise<any[]> {
    const query = `
      SELECT 
        timestamp, health_score, is_healthy, consecutive_failures,
        response_time, success_rate, degradation_trend, block_sync_status
      FROM provider_health_events
      WHERE chain_id = $1 AND provider_name = $2
        AND timestamp >= NOW() - INTERVAL '${hours} hours'
      ORDER BY timestamp DESC
      LIMIT 1000
    `;

    try {
      const result = await this.pool.query(query, [chainId, providerName]);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get provider health history', { chainId, providerName, hours, error });
      throw error;
    }
  }

  /**
   * Get failover statistics
   */
  async getFailoverStats(chainId?: number, hours: number = 24): Promise<{
    totalFailovers: number;
    successfulFailovers: number;
    failedFailovers: number;
    averageLatency: number;
    mostCommonReason: string;
    providerSwitches: Array<{ fromProvider: string; toProvider: string; count: number }>;
  }> {
    let whereClause = "WHERE timestamp >= NOW() - INTERVAL '" + hours + " hours'";
    const values: any[] = [];
    
    if (chainId) {
      whereClause += " AND chain_id = $1";
      values.push(chainId);
    }

    try {
      // Get basic statistics
      const statsQuery = `
        SELECT 
          COUNT(*) as total_failovers,
          COUNT(*) FILTER (WHERE success = true) as successful_failovers,
          COUNT(*) FILTER (WHERE success = false) as failed_failovers,
          COALESCE(AVG(switch_latency), 0) as average_latency
        FROM failover_events
        ${whereClause}
      `;
      
      const statsResult = await this.pool.query(statsQuery, values);
      const stats = statsResult.rows[0];
      
      // Get most common reason
      const reasonQuery = `
        SELECT reason, COUNT(*) as count
        FROM failover_events
        ${whereClause}
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 1
      `;
      
      const reasonResult = await this.pool.query(reasonQuery, values);
      const mostCommonReason = reasonResult.rows[0]?.reason || 'none';
      
      // Get provider switches
      const switchesQuery = `
        SELECT from_provider, to_provider, COUNT(*) as count
        FROM failover_events
        ${whereClause}
        GROUP BY from_provider, to_provider
        ORDER BY count DESC
        LIMIT 10
      `;
      
      const switchesResult = await this.pool.query(switchesQuery, values);
      const providerSwitches = switchesResult.rows.map(row => ({
        fromProvider: row.from_provider,
        toProvider: row.to_provider,
        count: parseInt(row.count)
      }));
      
      return {
        totalFailovers: parseInt(stats.total_failovers),
        successfulFailovers: parseInt(stats.successful_failovers),
        failedFailovers: parseInt(stats.failed_failovers),
        averageLatency: Math.round(parseFloat(stats.average_latency)),
        mostCommonReason,
        providerSwitches
      };
      
    } catch (error) {
      logger.error('Failed to get failover statistics', { chainId, hours, error });
      throw error;
    }
  }

  /**
   * Get provider reliability metrics
   */
  async getProviderReliabilityMetrics(chainId: number, hours: number = 24): Promise<Array<{
    providerName: string;
    averageHealthScore: number;
    uptimePercentage: number;
    failoverCount: number;
    circuitBreakerEvents: number;
    averageResponseTime: number;
    currentSuccessRate: number;
  }>> {
    const query = `
      WITH provider_stats AS (
        SELECT 
          provider_name,
          AVG(health_score) as avg_health_score,
          (COUNT(*) FILTER (WHERE is_healthy = true) * 100.0 / COUNT(*)) as uptime_percentage,
          AVG(response_time) as avg_response_time,
          AVG(success_rate) as avg_success_rate
        FROM provider_health_events
        WHERE chain_id = $1 AND timestamp >= NOW() - INTERVAL '${hours} hours'
        GROUP BY provider_name
      ),
      failover_counts AS (
        SELECT 
          from_provider as provider_name,
          COUNT(*) as failover_count
        FROM failover_events
        WHERE chain_id = $1 AND timestamp >= NOW() - INTERVAL '${hours} hours'
        GROUP BY from_provider
      ),
      circuit_breaker_counts AS (
        SELECT 
          provider_name,
          COUNT(*) as circuit_breaker_events
        FROM circuit_breaker_events
        WHERE chain_id = $1 AND timestamp >= NOW() - INTERVAL '${hours} hours'
        GROUP BY provider_name
      )
      SELECT 
        ps.provider_name,
        COALESCE(ps.avg_health_score, 0) as average_health_score,
        COALESCE(ps.uptime_percentage, 0) as uptime_percentage,
        COALESCE(fc.failover_count, 0) as failover_count,
        COALESCE(cbc.circuit_breaker_events, 0) as circuit_breaker_events,
        COALESCE(ps.avg_response_time, 0) as average_response_time,
        COALESCE(ps.avg_success_rate, 0) as current_success_rate
      FROM provider_stats ps
      LEFT JOIN failover_counts fc ON ps.provider_name = fc.provider_name
      LEFT JOIN circuit_breaker_counts cbc ON ps.provider_name = cbc.provider_name
      ORDER BY ps.avg_health_score DESC
    `;

    try {
      const result = await this.pool.query(query, [chainId]);
      return result.rows.map(row => ({
        providerName: row.provider_name,
        averageHealthScore: Math.round(parseFloat(row.average_health_score)),
        uptimePercentage: Math.round(parseFloat(row.uptime_percentage) * 10) / 10,
        failoverCount: parseInt(row.failover_count),
        circuitBreakerEvents: parseInt(row.circuit_breaker_events),
        averageResponseTime: Math.round(parseFloat(row.average_response_time)),
        currentSuccessRate: Math.round(parseFloat(row.current_success_rate) * 10) / 10
      }));
    } catch (error) {
      logger.error('Failed to get provider reliability metrics', { chainId, hours, error });
      throw error;
    }
  }
}

// Export singleton instance
export const postgresRepository = new PostgresRepository();
