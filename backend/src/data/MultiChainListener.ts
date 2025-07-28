import { PublicClient } from 'viem';
import { logger } from '../utils/Logger.js';
import { redisCache } from '../storage/RedisCache.js';
import { rpcProviderManager } from './RpcProviderManager.js';
import EventEmitter from 'events';

export interface BlockHeaderEvent {
  chainId: number;
  chainName: string;
  blockNumber: bigint;
  blockHash: string;
  timestamp: number;
  provider: string;
  parentHash: string;
  gasLimit: bigint;
  gasUsed: bigint;
  baseFeePerGas?: bigint | undefined;
}

export interface ChainListener {
  chainId: number;
  chainName: string;
  client: PublicClient;
  isConnected: boolean;
  lastBlockNumber: bigint;
  consecutiveFailures: number;
  lastReconnectAttempt: number;
  unsubscribe?: (() => void) | undefined;
}

export interface ListenerStats {
  chainId: number;
  chainName: string;
  isConnected: boolean;
  lastBlockNumber: string;
  consecutiveFailures: number;
  lastReconnectAttempt: number;
  blocksReceived: number;
  averageBlockTime: number;
  providerName: string;
}

/**
 * MultiChain WebSocket Listener - Real-time block monitoring across all chains
 * 
 * This component establishes WebSocket connections to all configured chains and
 * provides real-time block header monitoring with automatic reconnection logic.
 * 
 * Features:
 * - Real-time WebSocket connections for all 3 chains
 * - Automatic reconnection with exponential backoff
 * - Block header parsing and event broadcasting
 * - Health monitoring and statistics tracking
 * - Integration with RPC Provider Manager for failover
 * - Redis caching for latest block data
 */
export class MultiChainListener extends EventEmitter {
  private chainListeners: Map<number, ChainListener> = new Map();
  private isInitialized: boolean = false;
  private isShuttingDown: boolean = false;
  private reconnectTimeouts: Map<number, NodeJS.Timeout> = new Map();
  
  // Statistics tracking
  private stats: Map<number, {
    blocksReceived: number;
    lastBlockTimes: number[];
    averageBlockTime: number;
  }> = new Map();

  // Configuration
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private readonly RECONNECT_BASE_DELAY = 1000; // 1 second
  private readonly RECONNECT_MAX_DELAY = 30000; // 30 seconds
  private readonly BLOCK_TIME_HISTORY_SIZE = 10;

  constructor() {
    super();
    this.setMaxListeners(50); // Support multiple listeners
  }

  /**
   * Initialize WebSocket listeners for all configured chains
   */
  async initialize(): Promise<void> {
    try {
      logger.startup('Initializing MultiChain WebSocket Listener...');

      // Ensure RPC Provider Manager is initialized
      if (!rpcProviderManager.isHealthy()) {
        throw new Error('RPC Provider Manager must be initialized before WebSocket listeners');
      }

      // Get all configured chains from RPC Provider Manager
      const connectionStats = rpcProviderManager.getConnectionStats();
      
      if (connectionStats.length === 0) {
        throw new Error('No chains configured in RPC Provider Manager');
      }

      // Initialize listeners for each chain
      for (const chainStats of connectionStats) {
        await this.initializeChainListener(chainStats.chainId, chainStats.chainName);
      }

      this.isInitialized = true;
      
      logger.startup('MultiChain WebSocket Listener initialized successfully', {
        totalChains: this.chainListeners.size,
        connectedChains: Array.from(this.chainListeners.values()).filter(l => l.isConnected).length
      });

      // Log connection status for each chain
      for (const [chainId, listener] of this.chainListeners) {
        logger.connection('Chain WebSocket status', {
          chainId,
          chainName: listener.chainName,
          isConnected: listener.isConnected,
          lastBlockNumber: listener.lastBlockNumber.toString()
        });
      }

    } catch (error) {
      logger.error('Failed to initialize MultiChain WebSocket Listener', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Initialize WebSocket listener for a specific chain
   */
  private async initializeChainListener(chainId: number, chainName: string): Promise<void> {
    try {
      logger.debug('Initializing WebSocket listener for chain', { chainId, chainName });

      // Get WebSocket client from RPC Provider Manager
      const wsClient = rpcProviderManager.getWebSocketProvider(chainId);
      
      const listener: ChainListener = {
        chainId,
        chainName,
        client: wsClient,
        isConnected: false,
        lastBlockNumber: 0n,
        consecutiveFailures: 0,
        lastReconnectAttempt: 0,
        unsubscribe: undefined
      };

      // Initialize statistics tracking
      this.stats.set(chainId, {
        blocksReceived: 0,
        lastBlockTimes: [],
        averageBlockTime: 0
      });

      this.chainListeners.set(chainId, listener);

      // Establish WebSocket connection
      await this.connectChainListener(chainId);

    } catch (error) {
      logger.error('Failed to initialize chain listener', error instanceof Error ? error : new Error(String(error)), {
        chainId,
        chainName
      });
      throw error;
    }
  }

  /**
   * Connect WebSocket listener for a specific chain
   */
  private async connectChainListener(chainId: number): Promise<void> {
    const listener = this.chainListeners.get(chainId);
    if (!listener) {
      throw new Error(`No listener found for chain ${chainId}`);
    }

    try {
      logger.debug('Connecting WebSocket listener', {
        chainId: listener.chainId,
        chainName: listener.chainName
      });

      // Subscribe to new block headers
      const unsubscribe = listener.client.watchBlockNumber({
        onBlockNumber: (blockNumber) => {
          this.handleNewBlock(chainId, blockNumber);
        },
        onError: (error) => {
          this.handleConnectionError(chainId, error);
        }
      });

      // Update listener state
      listener.unsubscribe = unsubscribe;
      listener.isConnected = true;
      listener.consecutiveFailures = 0;

      logger.connection('WebSocket listener connected successfully', {
        chainId: listener.chainId,
        chainName: listener.chainName
      });

      // Get initial block number
      try {
        const currentBlock = await listener.client.getBlockNumber();
        listener.lastBlockNumber = currentBlock;
        
        logger.debug('Initial block number retrieved', {
          chainId: listener.chainId,
          blockNumber: currentBlock.toString()
        });
      } catch (error) {
        logger.warn('Failed to get initial block number', {
          chainId: listener.chainId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }

    } catch (error) {
      listener.isConnected = false;
      listener.consecutiveFailures++;

      logger.error('Failed to connect WebSocket listener', error instanceof Error ? error : new Error(String(error)), {
        chainId: listener.chainId,
        chainName: listener.chainName,
        consecutiveFailures: listener.consecutiveFailures
      });

      // Schedule reconnection if not shutting down
      if (!this.isShuttingDown) {
        this.scheduleReconnection(chainId);
      }
    }
  }

  /**
   * Handle new block reception
   */
  private async handleNewBlock(chainId: number, blockNumber: bigint): Promise<void> {
    const listener = this.chainListeners.get(chainId);
    if (!listener) {
      logger.warn('Received block for unknown chain', { chainId, blockNumber: blockNumber.toString() });
      return;
    }

    try {
      // Skip if this is an old block
      if (blockNumber <= listener.lastBlockNumber) {
        return;
      }

      // Get full block header information
      const block = await listener.client.getBlock({ blockNumber });
      
      // Update statistics
      this.updateBlockStatistics(chainId, block.timestamp);
      
      // Update listener state
      listener.lastBlockNumber = blockNumber;
      listener.consecutiveFailures = 0;

      // Create block header event with proper null handling
      const blockEvent: BlockHeaderEvent = {
        chainId: listener.chainId,
        chainName: listener.chainName,
        blockNumber: block.number,
        blockHash: block.hash,
        timestamp: Number(block.timestamp),
        provider: this.getCurrentProviderName(chainId),
        parentHash: block.parentHash,
        gasLimit: block.gasLimit,
        gasUsed: block.gasUsed,
        baseFeePerGas: block.baseFeePerGas ?? undefined
      };

      // Cache latest block data in Redis
      await this.cacheBlockData(chainId, blockEvent);

      // Emit block event for downstream systems
      this.emit('newBlock', blockEvent);
      this.emit(`newBlock:${chainId}`, blockEvent);

      logger.debug('New block processed', {
        chainId: listener.chainId,
        chainName: listener.chainName,
        blockNumber: blockNumber.toString(),
        timestamp: blockEvent.timestamp,
        gasUsed: block.gasUsed.toString(),
        provider: blockEvent.provider
      });

    } catch (error) {
      logger.error('Failed to process new block', error instanceof Error ? error : new Error(String(error)), {
        chainId,
        blockNumber: blockNumber.toString()
      });

      // Increment failure count but don't trigger reconnection for processing errors
      listener.consecutiveFailures++;
    }
  }

  /**
   * Handle WebSocket connection errors
   */
  private handleConnectionError(chainId: number, error: Error): void {
    const listener = this.chainListeners.get(chainId);
    if (!listener) {
      return;
    }

    listener.isConnected = false;
    listener.consecutiveFailures++;

    logger.warn('WebSocket connection error', {
      chainId: listener.chainId,
      chainName: listener.chainName,
      consecutiveFailures: listener.consecutiveFailures,
      error: error.message
    });

    // Emit connection error event
    this.emit('connectionError', {
      chainId,
      chainName: listener.chainName,
      error: error.message,
      consecutiveFailures: listener.consecutiveFailures
    });

    // Trigger reconnection if we've exceeded failure threshold
    if (listener.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      logger.error('WebSocket listener exceeded failure threshold, switching provider', {
        chainId: listener.chainId,
        chainName: listener.chainName,
        consecutiveFailures: listener.consecutiveFailures
      });

      // Request provider switch from RPC Provider Manager
      rpcProviderManager.switchProvider(chainId, 'websocket_excessive_failures')
        .then(switched => {
          if (switched) {
            // Reinitialize with new provider
            this.reinitializeChainListener(chainId);
          } else {
            // No healthy providers available, schedule reconnection
            this.scheduleReconnection(chainId);
          }
        })
        .catch(switchError => {
          logger.error('Failed to switch provider after WebSocket failures', switchError instanceof Error ? switchError : new Error(String(switchError)), {
            chainId: listener.chainId
          });
          this.scheduleReconnection(chainId);
        });
    } else {
      // Schedule reconnection with current provider
      this.scheduleReconnection(chainId);
    }
  }

  /**
   * Reinitialize chain listener with new provider
   */
  private async reinitializeChainListener(chainId: number): Promise<void> {
    const listener = this.chainListeners.get(chainId);
    if (!listener) {
      return;
    }

    try {
      // Cleanup existing connection
      if (listener.unsubscribe) {
        listener.unsubscribe();
        listener.unsubscribe = undefined;
      }

      // Get new WebSocket client from provider manager
      listener.client = rpcProviderManager.getWebSocketProvider(chainId);
      listener.isConnected = false;

      // Reconnect with new provider
      await this.connectChainListener(chainId);

      logger.info('WebSocket listener reinitialized with new provider', {
        chainId: listener.chainId,
        chainName: listener.chainName,
        newProvider: this.getCurrentProviderName(chainId)
      });

    } catch (error) {
      logger.error('Failed to reinitialize WebSocket listener', error instanceof Error ? error : new Error(String(error)), {
        chainId: listener.chainId
      });
      
      // Schedule reconnection as fallback
      this.scheduleReconnection(chainId);
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnection(chainId: number): void {
    if (this.isShuttingDown) {
      return;
    }

    const listener = this.chainListeners.get(chainId);
    if (!listener) {
      return;
    }

    // Clear any existing reconnection timeout
    const existingTimeout = this.reconnectTimeouts.get(chainId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Calculate exponential backoff delay
    const baseDelay = this.RECONNECT_BASE_DELAY;
    const exponentialDelay = Math.min(
      baseDelay * Math.pow(2, listener.consecutiveFailures - 1),
      this.RECONNECT_MAX_DELAY
    );
    
    // Add jitter to avoid thundering herd
    const jitter = Math.random() * 1000;
    const delay = exponentialDelay + jitter;

    logger.debug('Scheduling WebSocket reconnection', {
      chainId: listener.chainId,
      chainName: listener.chainName,
      delay: Math.round(delay),
      consecutiveFailures: listener.consecutiveFailures
    });

    const timeout = setTimeout(async () => {
      this.reconnectTimeouts.delete(chainId);
      listener.lastReconnectAttempt = Date.now();
      await this.connectChainListener(chainId);
    }, delay);

    this.reconnectTimeouts.set(chainId, timeout);
  }

  /**
   * Update block timing statistics
   */
  private updateBlockStatistics(chainId: number, blockTimestamp: bigint): void {
    const stats = this.stats.get(chainId);
    if (!stats) {
      return;
    }

    const currentTime = Number(blockTimestamp) * 1000; // Convert to milliseconds
    stats.blocksReceived++;

    // Update block time history
    if (stats.lastBlockTimes.length > 0) {
      const lastIndex = stats.lastBlockTimes.length - 1;
      const lastBlockTime = stats.lastBlockTimes[lastIndex];
      
      if (lastBlockTime !== undefined) {
        stats.lastBlockTimes.push(currentTime);
        
        // Keep only recent block times for average calculation
        if (stats.lastBlockTimes.length > this.BLOCK_TIME_HISTORY_SIZE) {
          stats.lastBlockTimes.shift();
        }
        
        // Calculate average block time
        if (stats.lastBlockTimes.length >= 2) {
          const timeDiffs: number[] = [];
          for (let i = 1; i < stats.lastBlockTimes.length; i++) {
            const current = stats.lastBlockTimes[i];
            const previous = stats.lastBlockTimes[i - 1];
            if (current !== undefined && previous !== undefined) {
              timeDiffs.push(current - previous);
            }
          }
          if (timeDiffs.length > 0) {
            stats.averageBlockTime = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length / 1000; // Convert to seconds
          }
        }
      }
    } else {
      stats.lastBlockTimes.push(currentTime);
    }
  }

  /**
   * Cache latest block data in Redis
   */
  private async cacheBlockData(chainId: number, blockEvent: BlockHeaderEvent): Promise<void> {
    try {
      if (!redisCache.isHealthy()) {
        return; // Skip caching if Redis is not healthy
      }

      await redisCache.set(
        `latest_block:${chainId}`,
        {
          blockNumber: blockEvent.blockNumber.toString(),
          blockHash: blockEvent.blockHash,
          timestamp: blockEvent.timestamp,
          provider: blockEvent.provider,
          gasUsed: blockEvent.gasUsed.toString(),
          baseFeePerGas: blockEvent.baseFeePerGas?.toString()
        },
        300 // 5 minute TTL
      );

    } catch (error) {
      // Don't throw on cache errors - block processing is more important
      logger.warn('Failed to cache block data', {
        chainId,
        blockNumber: blockEvent.blockNumber.toString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get current provider name for a chain
   */
  private getCurrentProviderName(chainId: number): string {
    try {
      const connectionStats = rpcProviderManager.getConnectionStats();
      const chainStats = connectionStats.find(stats => stats.chainId === chainId);
      return chainStats?.currentProvider || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Get listener statistics for all chains
   */
  getListenerStats(): ListenerStats[] {
    const results: ListenerStats[] = [];

    for (const [chainId, listener] of this.chainListeners) {
      const stats = this.stats.get(chainId);
      
      results.push({
        chainId: listener.chainId,
        chainName: listener.chainName,
        isConnected: listener.isConnected,
        lastBlockNumber: listener.lastBlockNumber.toString(),
        consecutiveFailures: listener.consecutiveFailures,
        lastReconnectAttempt: listener.lastReconnectAttempt,
        blocksReceived: stats?.blocksReceived || 0,
        averageBlockTime: stats?.averageBlockTime || 0,
        providerName: this.getCurrentProviderName(chainId)
      });
    }

    return results;
  }

  /**
   * Get latest block data for a specific chain
   */
  async getLatestBlock(chainId: number): Promise<BlockHeaderEvent | null> {
    try {
      // First try to get from cache
      const cachedBlock = await redisCache.get<any>(`latest_block:${chainId}`);
      if (cachedBlock) {
        const listener = this.chainListeners.get(chainId);
        return {
          chainId,
          chainName: listener?.chainName || 'unknown',
          blockNumber: BigInt(cachedBlock.blockNumber),
          blockHash: cachedBlock.blockHash,
          timestamp: cachedBlock.timestamp,
          provider: cachedBlock.provider,
          parentHash: '', // Not cached
          gasLimit: 0n, // Not cached
          gasUsed: BigInt(cachedBlock.gasUsed || '0'),
          baseFeePerGas: cachedBlock.baseFeePerGas ? BigInt(cachedBlock.baseFeePerGas) : undefined
        };
      }

      // Fallback to direct RPC call
      const listener = this.chainListeners.get(chainId);
      if (!listener || !listener.isConnected) {
        return null;
      }

      const block = await listener.client.getBlock({ blockTag: 'latest' });
      return {
        chainId,
        chainName: listener.chainName,
        blockNumber: block.number,
        blockHash: block.hash,
        timestamp: Number(block.timestamp),
        provider: this.getCurrentProviderName(chainId),
        parentHash: block.parentHash,
        gasLimit: block.gasLimit,
        gasUsed: block.gasUsed,
        baseFeePerGas: block.baseFeePerGas ?? undefined
      };

    } catch (error) {
      logger.error('Failed to get latest block', error instanceof Error ? error : new Error(String(error)), {
        chainId
      });
      return null;
    }
  }

  /**
   * Check if WebSocket listeners are healthy
   */
  isHealthy(): boolean {
    if (!this.isInitialized) {
      return false;
    }

    // At least 80% of listeners should be connected
    const totalListeners = this.chainListeners.size;
    if (totalListeners === 0) {
      return false;
    }

    const connectedListeners = Array.from(this.chainListeners.values()).filter(l => l.isConnected).length;
    const healthyRatio = connectedListeners / totalListeners;
    
    return healthyRatio >= 0.8; // 80% threshold
  }

  /**
   * Force reconnection for a specific chain
   */
  async reconnectChain(chainId: number): Promise<boolean> {
    const listener = this.chainListeners.get(chainId);
    if (!listener) {
      logger.warn('Cannot reconnect unknown chain', { chainId });
      return false;
    }

    try {
      logger.info('Forcing WebSocket reconnection', {
        chainId: listener.chainId,
        chainName: listener.chainName
      });

      // Cleanup existing connection
      if (listener.unsubscribe) {
        listener.unsubscribe();
        listener.unsubscribe = undefined;
      }

      listener.isConnected = false;
      listener.consecutiveFailures = 0;

      // Clear any pending reconnection
      const existingTimeout = this.reconnectTimeouts.get(chainId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.reconnectTimeouts.delete(chainId);
      }

      // Reconnect immediately
      await this.connectChainListener(chainId);
      
      return listener.isConnected;

    } catch (error) {
      logger.error('Failed to force reconnect chain', error instanceof Error ? error : new Error(String(error)), {
        chainId: listener.chainId
      });
      return false;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.shutdown('Shutting down MultiChain WebSocket Listener...');
    
    this.isShuttingDown = true;

    // Clear all reconnection timeouts
    for (const [chainId, timeout] of this.reconnectTimeouts) {
      clearTimeout(timeout);
      logger.debug('Cleared reconnection timeout', { chainId });
    }
    this.reconnectTimeouts.clear();

    // Disconnect all WebSocket listeners
    for (const [, listener] of this.chainListeners) {
      try {
        if (listener.unsubscribe) {
          listener.unsubscribe();
          logger.debug('WebSocket listener unsubscribed', {
            chainId: listener.chainId,
            chainName: listener.chainName
          });
        }
        listener.isConnected = false;
      } catch (error) {
        logger.error('Error disconnecting WebSocket listener', error instanceof Error ? error : new Error(String(error)), {
          chainId: listener.chainId
        });
      }
    }

    // Remove all event listeners
    this.removeAllListeners();

    this.isInitialized = false;
    logger.shutdown('MultiChain WebSocket Listener shutdown complete');
  }
}

// Export singleton instance
export const multiChainListener = new MultiChainListener();
