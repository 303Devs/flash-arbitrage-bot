/**
 * Flash Arbitrage Bot - Main Entry Point
 * 
 * This is the main entry point for the flash arbitrage bot.
 * It initializes all systems and orchestrates the trading pipeline.
 */

import dotenv from 'dotenv';
import { logger } from './src/utils/Logger.js';
import { redisCache } from './src/storage/RedisCache.js';
import { postgresRepository } from './src/storage/PostgresRepository.js';
import { rpcProviderManager } from './src/data/RpcProviderManager.js';
import { multiChainListener } from './src/data/MultiChainListener.js';

// Load environment variables
dotenv.config();

class FlashArbitrageBot {
  private isShuttingDown = false;

  constructor() {
    this.setupSignalHandlers();
  }

  /**
   * Initialize and start the bot
   */
  async start(): Promise<void> {
    try {
      logger.startup('🚀 Flash Arbitrage Bot Starting...');
      
      // Phase 1: Initialize infrastructure
      await this.initializeInfrastructure();
      
      // Phase 2: Start advanced monitoring systems
      await this.initializeAdvancedMonitoring();
      
      // TODO: Phase 3 - Start trading pipeline
      
      logger.startup('✅ Flash Arbitrage Bot started successfully');
      logger.startup('🔍 Bot is now monitoring for arbitrage opportunities...');
      
    } catch (error) {
      logger.error('❌ Failed to start Flash Arbitrage Bot', error instanceof Error ? error : new Error(String(error)));
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * Initialize core infrastructure components
   */
  private async initializeInfrastructure(): Promise<void> {
    logger.startup('📡 Initializing infrastructure...');
    
    // Initialize Redis cache
    logger.startup('🔴 Connecting to Redis...');
    await redisCache.connect();
    logger.startup('✅ Redis connected successfully');
    
    // Initialize PostgreSQL repository
    logger.startup('🐘 Connecting to PostgreSQL...');
    await postgresRepository.connect();
    await postgresRepository.createTables();
    await postgresRepository.createHealthMonitoringTables();
    logger.startup('✅ PostgreSQL connected successfully');
    
    // Initialize RPC Provider Manager
    logger.startup('⛓️  Initializing RPC Provider Manager...');
    await rpcProviderManager.initialize();
    logger.startup('✅ RPC Provider Manager initialized successfully');
    
    // Verify all systems are healthy
    const systemHealth = {
      redis: redisCache.isHealthy(),
      postgres: postgresRepository.isHealthy(),
      rpcProviders: rpcProviderManager.isHealthy()
    };
    
    logger.startup('🏥 System Health Check:', systemHealth);
    
    if (!Object.values(systemHealth).every(Boolean)) {
      throw new Error('One or more infrastructure components are unhealthy');
    }
    
    // Log RPC provider statistics
    const connectionStats = rpcProviderManager.getConnectionStats();
    logger.startup('📊 RPC Connection Statistics:');
    connectionStats.forEach(stats => {
      logger.startup(`Chain ${stats.chainId} (${stats.chainName}):`, {
        totalProviders: stats.totalProviders,
        healthyProviders: stats.healthyProviders,
        currentProvider: stats.currentProvider
      });
    });
  }

  /**
   * Initialize Phase 2 advanced monitoring systems
   */
  private async initializeAdvancedMonitoring(): Promise<void> {
    logger.startup('🔄 Initializing Phase 2 Advanced Monitoring...');
    
    try {
      // Initialize MultiChain WebSocket Listener
      logger.startup('📡 Starting MultiChain WebSocket Listener...');
      await multiChainListener.initialize();
      logger.startup('✅ MultiChain WebSocket Listener started successfully');
      
      // Log listener statistics
      const listenerStats = multiChainListener.getListenerStats();
      logger.startup('📊 WebSocket Listener Statistics:');
      listenerStats.forEach(stats => {
        logger.startup(`Chain ${stats.chainId} (${stats.chainName}):`, {
          isConnected: stats.isConnected,
          lastBlockNumber: stats.lastBlockNumber,
          blocksReceived: stats.blocksReceived,
          averageBlockTime: Math.round(stats.averageBlockTime * 100) / 100,
          providerName: stats.providerName
        });
      });
      
      logger.startup('✅ Phase 2 Advanced Monitoring initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Phase 2 Advanced Monitoring', error instanceof Error ? error : new Error(String(error)));
      // Don't throw - basic functionality should still work
      logger.warn('⚠️  Continuing with basic monitoring only');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }
    
    this.isShuttingDown = true;
    logger.shutdown('🛑 Initiating graceful shutdown...');
    
    try {
      // TODO: Stop trading pipeline when implemented
      
      // Shutdown Phase 2 monitoring systems
      logger.shutdown('📡 Shutting down MultiChain WebSocket Listener...');
      await multiChainListener.shutdown();
      
      // Shutdown infrastructure in reverse order
      logger.shutdown('⛓️  Shutting down RPC Provider Manager...');
      await rpcProviderManager.shutdown();
      
      logger.shutdown('🐘 Shutting down PostgreSQL connection...');
      await postgresRepository.disconnect();
      
      logger.shutdown('🔴 Shutting down Redis connection...');
      await redisCache.disconnect();
      
      logger.shutdown('✅ Graceful shutdown completed');
    } catch (error) {
      logger.error('❌ Error during shutdown:', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      logger.shutdown('📡 Received SIGINT signal');
      await this.shutdown();
      process.exit(0);
    });

    // Handle SIGTERM (Docker/PM2 shutdown)
    process.on('SIGTERM', async () => {
      logger.shutdown('📡 Received SIGTERM signal');
      await this.shutdown();
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.error('🚨 Uncaught Exception:', error);
      await this.shutdown();
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('🚨 Unhandled Rejection at:', { promise, reason });
      await this.shutdown();
      process.exit(1);
    });
  }
}

// Create and start the bot
const bot = new FlashArbitrageBot();

// Export for testing
export { FlashArbitrageBot };

// Start the bot if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  bot.start().catch(error => {
    logger.error('💥 Fatal error starting bot:', error);
    process.exit(1);
  });
}
