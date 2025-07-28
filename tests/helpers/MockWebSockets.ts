/**
 * 🔌 WebSocket Testing Infrastructure
 *
 * Enterprise-grade WebSocket testing utilities for real-time block monitoring
 * and event simulation. Supports connection testing and event injection.
 *
 * @fileoverview WebSocket testing infrastructure for MEV arbitrage bot
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '@utils/Logger';

/**
 * WebSocket test configuration
 */
export interface WebSocketTestConfig {
  url: string;
  chainId: number;
  chainName: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  timeout: number;
}

/**
 * Mock WebSocket server configuration
 */
export interface MockWebSocketConfig {
  port: number;
  host: string;
  chainId: number;
  autoSendBlocks: boolean;
  blockInterval: number;
  eventTypes: string[];
}

/**
 * Block event data for testing
 */
export interface TestBlockEvent {
  chainId: number;
  blockNumber: number;
  blockHash: string;
  timestamp: number;
  gasLimit: string;
  gasUsed: string;
  baseFeePerGas?: string;
  parentHash: string;
}

/**
 * Connection health test result
 */
export interface ConnectionTestResult {
  connected: boolean;
  connectionTime: number;
  latency: number;
  messagesReceived: number;
  messagesExpected: number;
  errors: string[];
  testId: string;
}

/**
 * WebSocket event statistics
 */
export interface WebSocketStats {
  connectionsEstablished: number;
  connectionsFailed: number;
  messagesReceived: number;
  messagesSent: number;
  reconnectAttempts: number;
  averageLatency: number;
  uptime: number;
  lastMessageTime: Date | null;
}

/**
 * Test WebSocket Manager
 *
 * Manages WebSocket connections for testing with real-time event simulation
 */
export class TestWebSocketManager extends EventEmitter {
  private readonly logger = Logger.getInstance();
  private ws: WebSocket | null = null;
  private config: WebSocketTestConfig;
  private testId: string;
  private stats: WebSocketStats;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private connectTime: number = 0;
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(config: WebSocketTestConfig, testId: string) {
    super();
    this.config = config;
    this.testId = testId;
    this.stats = {
      connectionsEstablished: 0,
      connectionsFailed: 0,
      messagesReceived: 0,
      messagesSent: 0,
      reconnectAttempts: 0,
      averageLatency: 0,
      uptime: 0,
      lastMessageTime: null,
    };
  }

  /**
   * Connect to WebSocket
   */
  public async connect(): Promise<void> {
    if (this.isConnecting || this.isConnected()) {
      return;
    }

    this.isConnecting = true;
    this.connectTime = Date.now();

    this.logger.debug('Connecting to test WebSocket', {
      testId: this.testId,
      url: this.config.url,
      chainId: this.config.chainId,
    });

    try {
      this.ws = new WebSocket(this.config.url);
      this.setupEventHandlers();

      // Wait for connection or timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, this.config.timeout);

        this.ws!.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.ws!.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      this.isConnecting = false;
      this.stats.connectionsFailed++;

      this.logger.error('WebSocket connection failed', {
        testId: this.testId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => {
      this.isConnecting = false;
      this.stats.connectionsEstablished++;
      const connectionTime = Date.now() - this.connectTime;

      this.logger.info('WebSocket test connection established', {
        testId: this.testId,
        connectionTimeMs: connectionTime,
        chainId: this.config.chainId,
      });

      // Subscribe to block headers
      this.subscribeToBlocks();

      // Start heartbeat
      this.startHeartbeat();

      this.emit('connected', { testId: this.testId, connectionTime });
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.stats.messagesReceived++;
      this.stats.lastMessageTime = new Date();

      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        this.logger.error('Failed to parse WebSocket message', {
          testId: this.testId,
          error: error instanceof Error ? error.message : 'Unknown error',
          data: data.toString(),
        });
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.logger.info('WebSocket connection closed', {
        testId: this.testId,
        code,
        reason: reason.toString(),
      });

      this.cleanup();

      if (this.shouldReconnect && this.stats.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.scheduleReconnect();
      }

      this.emit('disconnected', { testId: this.testId, code, reason: reason.toString() });
    });

    this.ws.on('error', (error: Error) => {
      this.logger.error('WebSocket error', {
        testId: this.testId,
        error: error.message,
      });

      this.emit('error', { testId: this.testId, error });
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(message: any): void {
    if (message.method === 'eth_subscription' && message.params) {
      const subscription = message.params.subscription;
      const result = message.params.result;

      if (result && result.number) {
        // This is a block header
        const blockEvent: TestBlockEvent = {
          chainId: this.config.chainId,
          blockNumber: parseInt(result.number, 16),
          blockHash: result.hash,
          timestamp: parseInt(result.timestamp, 16),
          gasLimit: result.gasLimit,
          gasUsed: result.gasUsed,
          baseFeePerGas: result.baseFeePerGas,
          parentHash: result.parentHash,
        };

        this.logger.debug('Received block event', {
          testId: this.testId,
          blockNumber: blockEvent.blockNumber,
          chainId: blockEvent.chainId,
        });

        this.emit('blockEvent', blockEvent);
      }
    }
  }

  /**
   * Subscribe to block headers
   */
  private subscribeToBlocks(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const subscriptionMessage = {
      id: 1,
      method: 'eth_subscribe',
      params: ['newHeads'],
    };

    this.ws.send(JSON.stringify(subscriptionMessage));
    this.stats.messagesSent++;

    this.logger.debug('Subscribed to block headers', { testId: this.testId });
  }

  /**
   * Start heartbeat mechanism
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send ping
        this.ws.ping();
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.stats.reconnectAttempts++;

    this.logger.info('Scheduling WebSocket reconnection', {
      testId: this.testId,
      attempt: this.stats.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error('WebSocket reconnection failed', {
          testId: this.testId,
          attempt: this.stats.reconnectAttempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.config.reconnectInterval);
  }

  /**
   * Check if WebSocket is connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect WebSocket
   */
  public async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    this.cleanup();

    if (this.ws) {
      this.ws.close(1000, 'Test completed');
      this.ws = null;
    }

    this.logger.debug('WebSocket disconnected', { testId: this.testId });
  }

  /**
   * Cleanup timers and resources
   */
  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Get connection statistics
   */
  public getStats(): WebSocketStats {
    const uptime = this.stats.connectionsEstablished > 0 ? Date.now() - this.connectTime : 0;
    return {
      ...this.stats,
      uptime,
    };
  }

  /**
   * Inject test block event
   */
  public injectTestBlockEvent(blockEvent: TestBlockEvent): void {
    this.logger.debug('Injecting test block event', {
      testId: this.testId,
      blockNumber: blockEvent.blockNumber,
      chainId: blockEvent.chainId,
    });

    this.emit('blockEvent', blockEvent);
  }
}

/**
 * Block Event Simulator
 *
 * Simulates realistic block events for testing
 */
export class BlockEventSimulator {
  private readonly logger = Logger.getInstance();
  private chainId: number;
  private currentBlockNumber: number;
  private interval: NodeJS.Timeout | null = null;
  private eventEmitter: EventEmitter;
  private isRunning = false;

  constructor(chainId: number, startingBlockNumber: number = 18000000) {
    this.chainId = chainId;
    this.currentBlockNumber = startingBlockNumber;
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Start simulating block events
   */
  public start(intervalMs: number = 12000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    this.logger.info('Starting block event simulation', {
      chainId: this.chainId,
      startingBlock: this.currentBlockNumber,
      intervalMs,
    });

    this.interval = setInterval(() => {
      this.generateBlockEvent();
    }, intervalMs);

    // Generate first block immediately
    this.generateBlockEvent();
  }

  /**
   * Stop simulating block events
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    this.logger.info('Stopped block event simulation', { chainId: this.chainId });
  }

  /**
   * Generate realistic block event
   */
  private generateBlockEvent(): void {
    this.currentBlockNumber++;

    const blockEvent: TestBlockEvent = {
      chainId: this.chainId,
      blockNumber: this.currentBlockNumber,
      blockHash: this.generateBlockHash(this.currentBlockNumber),
      timestamp: Math.floor(Date.now() / 1000),
      gasLimit: '0x1c9c380', // 30M gas
      gasUsed: this.generateRandomGasUsed(),
      baseFeePerGas: this.generateBaseFee(),
      parentHash: this.generateBlockHash(this.currentBlockNumber - 1),
    };

    this.logger.debug('Generated block event', {
      chainId: this.chainId,
      blockNumber: blockEvent.blockNumber,
      gasUsed: blockEvent.gasUsed,
    });

    this.eventEmitter.emit('blockEvent', blockEvent);
  }

  /**
   * Generate block hash
   */
  private generateBlockHash(blockNumber: number): string {
    const hash =
      blockNumber.toString(16).padStart(8, '0') + Math.random().toString(16).substr(2, 8).repeat(7);
    return '0x' + hash.substr(0, 64);
  }

  /**
   * Generate random gas used value
   */
  private generateRandomGasUsed(): string {
    const gasUsed = Math.floor(Math.random() * 25000000) + 5000000; // 5M to 30M
    return '0x' + gasUsed.toString(16);
  }

  /**
   * Generate realistic base fee
   */
  private generateBaseFee(): string {
    const baseFee = Math.floor(Math.random() * 50) + 10; // 10-60 gwei
    const wei = baseFee * 1000000000;
    return '0x' + wei.toString(16);
  }

  /**
   * Subscribe to block events
   */
  public onBlockEvent(callback: (blockEvent: TestBlockEvent) => void): void {
    this.eventEmitter.on('blockEvent', callback);
  }

  /**
   * Get current block number
   */
  public getCurrentBlockNumber(): number {
    return this.currentBlockNumber;
  }

  /**
   * Set current block number
   */
  public setCurrentBlockNumber(blockNumber: number): void {
    this.currentBlockNumber = blockNumber;
  }
}

/**
 * Connection Tester
 *
 * Tests WebSocket connection scenarios and performance
 */
export class ConnectionTester {
  private readonly logger = Logger.getInstance();

  /**
   * Test WebSocket connection performance
   */
  public async testConnectionPerformance(
    config: WebSocketTestConfig,
    testId: string,
    duration: number = 30000
  ): Promise<ConnectionTestResult> {
    const errors: string[] = [];
    let messagesReceived = 0;
    const expectedMessages = Math.floor(duration / 12000); // Assuming 12s block time

    this.logger.info('Starting WebSocket connection performance test', {
      testId,
      durationMs: duration,
      expectedMessages,
    });

    const startTime = Date.now();
    const manager = new TestWebSocketManager(config, testId);

    try {
      // Connect
      const connectStart = Date.now();
      await manager.connect();
      const connectionTime = Date.now() - connectStart;

      // Monitor messages
      manager.on('blockEvent', () => {
        messagesReceived++;
      });

      manager.on('error', (error) => {
        errors.push(error.error?.message || 'Unknown error');
      });

      // Wait for test duration
      await new Promise((resolve) => setTimeout(resolve, duration));

      // Calculate latency (simplified)
      const stats = manager.getStats();
      const latency = stats.averageLatency || 0;

      await manager.disconnect();

      const result: ConnectionTestResult = {
        connected: true,
        connectionTime,
        latency,
        messagesReceived,
        messagesExpected: expectedMessages,
        errors,
        testId,
      };

      this.logger.info('WebSocket connection performance test complete', result);

      return result;
    } catch (error) {
      const result: ConnectionTestResult = {
        connected: false,
        connectionTime: Date.now() - startTime,
        latency: 0,
        messagesReceived,
        messagesExpected: expectedMessages,
        errors: [...errors, error instanceof Error ? error.message : 'Unknown error'],
        testId,
      };

      this.logger.error('WebSocket connection performance test failed', result);

      return result;
    }
  }

  /**
   * Test connection resilience
   */
  public async testConnectionResilience(
    config: WebSocketTestConfig,
    testId: string,
    disconnectAfter: number = 10000
  ): Promise<{ reconnected: boolean; reconnectTime: number; totalErrors: number }> {
    const manager = new TestWebSocketManager(config, testId);
    let reconnected = false;
    let reconnectTime = 0;
    let totalErrors = 0;

    this.logger.info('Starting WebSocket connection resilience test', {
      testId,
      disconnectAfterMs: disconnectAfter,
    });

    try {
      await manager.connect();

      // Wait then force disconnect
      setTimeout(() => {
        if (manager.isConnected()) {
          (manager as any).ws?.close(1006, 'Forced disconnect for testing');
        }
      }, disconnectAfter);

      // Monitor for reconnection
      const reconnectStart = Date.now();

      return new Promise((resolve) => {
        manager.on('connected', () => {
          if (reconnectStart > 0) {
            reconnected = true;
            reconnectTime = Date.now() - reconnectStart;

            setTimeout(async () => {
              await manager.disconnect();
              resolve({ reconnected, reconnectTime, totalErrors });
            }, 5000);
          }
        });

        manager.on('error', () => {
          totalErrors++;
        });

        // Timeout after reasonable time
        setTimeout(async () => {
          await manager.disconnect();
          resolve({ reconnected, reconnectTime, totalErrors });
        }, 60000);
      });
    } catch (error) {
      this.logger.error('WebSocket resilience test failed', {
        testId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return { reconnected: false, reconnectTime: 0, totalErrors: totalErrors + 1 };
    }
  }

  /**
   * Test multiple concurrent connections
   */
  public async testConcurrentConnections(
    configs: WebSocketTestConfig[],
    testId: string
  ): Promise<{ successful: number; failed: number; avgConnectionTime: number }> {
    this.logger.info('Starting concurrent WebSocket connections test', {
      testId,
      connectionCount: configs.length,
    });

    const results = await Promise.allSettled(
      configs.map(async (config, index) => {
        const manager = new TestWebSocketManager(config, `${testId}_${index}`);
        const start = Date.now();

        try {
          await manager.connect();
          const connectionTime = Date.now() - start;

          // Keep connection alive briefly then disconnect
          setTimeout(async () => {
            await manager.disconnect();
          }, 5000);

          return { success: true, connectionTime };
        } catch (error) {
          return { success: false, connectionTime: Date.now() - start };
        }
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;

    const connectionTimes = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as any).value.connectionTime);

    const avgConnectionTime =
      connectionTimes.length > 0
        ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
        : 0;

    this.logger.info('Concurrent WebSocket connections test complete', {
      testId,
      successful,
      failed,
      avgConnectionTimeMs: Math.round(avgConnectionTime),
    });

    return { successful, failed, avgConnectionTime };
  }
}

/**
 * WebSocket Testing Infrastructure
 *
 * Main class for orchestrating WebSocket testing utilities
 */
export class WebSocketTestInfra {
  private static readonly logger = logger;
  private static activeManagers = new Map<string, TestWebSocketManager>();
  private static activeSimulators = new Map<string, BlockEventSimulator>();

  /**
   * Create test WebSocket manager with default configurations
   */
  public static createTestWebSocket(
    testName: string,
    chainId: number = 42161,
    useTestnet: boolean = true
  ): TestWebSocketManager {
    const testId = `${testName}_${Date.now()}`;

    const config: WebSocketTestConfig = useTestnet
      ? {
          url: 'wss://ethereum-sepolia.rpc.quicknode.pro/demo',
          chainId: 11155111, // Sepolia
          chainName: 'Sepolia',
          reconnectInterval: 5000,
          maxReconnectAttempts: 3,
          heartbeatInterval: 30000,
          timeout: 10000,
        }
      : {
          url: process.env.QUICKNODE_ARBITRUM_WSS || 'wss://localhost:8546',
          chainId,
          chainName: 'Test Chain',
          reconnectInterval: 5000,
          maxReconnectAttempts: 3,
          heartbeatInterval: 30000,
          timeout: 10000,
        };

    const manager = new TestWebSocketManager(config, testId);
    this.activeManagers.set(testId, manager);

    this.logger.debug('Created test WebSocket manager', { testId, chainId, useTestnet });

    return manager;
  }

  /**
   * Create block event simulator
   */
  public static createBlockEventSimulator(
    chainId: number,
    startingBlock: number = 18000000
  ): BlockEventSimulator {
    const simulatorId = `simulator_${chainId}_${Date.now()}`;
    const simulator = new BlockEventSimulator(chainId, startingBlock);

    this.activeSimulators.set(simulatorId, simulator);

    this.logger.debug('Created block event simulator', { simulatorId, chainId, startingBlock });

    return simulator;
  }

  /**
   * Create connection tester
   */
  public static createConnectionTester(): ConnectionTester {
    return new ConnectionTester();
  }

  /**
   * Cleanup all active test instances
   */
  public static async cleanupAllInstances(): Promise<void> {
    this.logger.info('Cleaning up all WebSocket test instances', {
      managersCount: this.activeManagers.size,
      simulatorsCount: this.activeSimulators.size,
    });

    // Cleanup managers
    const managerCleanup = Array.from(this.activeManagers.values()).map((manager) =>
      manager
        .disconnect()
        .catch((error) => this.logger.error('Failed to cleanup WebSocket manager', { error }))
    );

    // Cleanup simulators
    const simulatorCleanup = Array.from(this.activeSimulators.values()).map((simulator) => {
      try {
        simulator.stop();
      } catch (error) {
        this.logger.error('Failed to cleanup block simulator', { error });
      }
    });

    await Promise.all(managerCleanup);
    await Promise.all(simulatorCleanup);

    this.activeManagers.clear();
    this.activeSimulators.clear();

    this.logger.info('All WebSocket test instances cleaned up');
  }

  /**
   * Get default test configurations for different scenarios
   */
  public static getTestConfigurations(): Record<string, WebSocketTestConfig> {
    return {
      fast: {
        url: 'wss://ethereum-sepolia.rpc.quicknode.pro/demo',
        chainId: 11155111,
        chainName: 'Sepolia Fast',
        reconnectInterval: 1000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 10000,
        timeout: 5000,
      },
      slow: {
        url: 'wss://ethereum-sepolia.rpc.quicknode.pro/demo',
        chainId: 11155111,
        chainName: 'Sepolia Slow',
        reconnectInterval: 10000,
        maxReconnectAttempts: 2,
        heartbeatInterval: 60000,
        timeout: 15000,
      },
      unreliable: {
        url: 'wss://ethereum-sepolia.rpc.quicknode.pro/demo',
        chainId: 11155111,
        chainName: 'Sepolia Unreliable',
        reconnectInterval: 2000,
        maxReconnectAttempts: 10,
        heartbeatInterval: 5000,
        timeout: 3000,
      },
    };
  }

  /**
   * Get active instance counts
   */
  public static getActiveInstanceCounts(): { managers: number; simulators: number } {
    return {
      managers: this.activeManagers.size,
      simulators: this.activeSimulators.size,
    };
  }

  /**
   * Create test block event data
   */
  public static createTestBlockEvent(
    chainId: number,
    blockNumber: number = 18000000
  ): TestBlockEvent {
    return {
      chainId,
      blockNumber,
      blockHash: '0x' + blockNumber.toString(16).padStart(8, '0') + '0'.repeat(56),
      timestamp: Math.floor(Date.now() / 1000),
      gasLimit: '0x1c9c380', // 30M
      gasUsed: '0x' + Math.floor(Math.random() * 20000000 + 5000000).toString(16),
      baseFeePerGas: '0x' + (Math.floor(Math.random() * 50 + 10) * 1000000000).toString(16),
      parentHash: '0x' + (blockNumber - 1).toString(16).padStart(8, '0') + '0'.repeat(56),
    };
  }
}
