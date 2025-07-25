import pino, { Logger as PinoLogger } from 'pino';
import { pinoConfig } from '../../logging.config';

/**
 * Logger Wrapper for Flash Arbitrage Bot
 */

// Create the logger with custom levels
const pinoLogger = pino(pinoConfig);

class Logger {
  private logger: typeof pinoLogger;

  constructor() {
    this.logger = pinoLogger;
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
}

// Export singleton instance
export const logger = new Logger();

// Export class
export { Logger };
