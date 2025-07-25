import { LoggerOptions } from 'pino';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Pino Logging Configuration for Flash Arbitrage Bot
 *
 * Best practice approach:
 * - Console: Always enabled with configurable level
 * - Files: app.log (info+), error.log (errors only), debug.log (everything)
 * - LOG_LEVEL environment variable controls console and root level
 */

const logLevel = process.env.LOG_LEVEL || 'info';
console.log(logLevel);
export const pinoConfig: LoggerOptions = {
  level: logLevel, // Root level - can be overridden by LOG_LEVEL env var
  // Base configuration
  name: 'flash-arbitrage-bot',
  timestamp: true,

  // Multiple outputs: console + 3 log files
  transport: {
    targets: [
      // Console output - level controlled by LOG_LEVEL env var
      {
        target: 'pino-pretty',
        level: logLevel,
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          messageKey: 'msg',
          levelKey: 'type',
          messageFormat: '{type} [{name}] {msg}',
          singleLine: false,
        },
      },

      // app.log - general application activity (info+)
      {
        target: 'pino/file',
        level: 'info',
        options: {
          destination: join(process.cwd(), 'logs', 'app.log'),
          mkdir: true,
        },
      },

      // error.log - only errors and fatal
      {
        target: 'pino/file',
        level: 'error',
        options: {
          destination: join(process.cwd(), 'logs', 'error.log'),
          mkdir: true,
        },
      },

      // debug.log - everything for detailed debugging
      {
        target: 'pino/file',
        level: 'debug',
        options: {
          destination: join(process.cwd(), 'logs', 'debug.log'),
          mkdir: true,
        },
      },
    ],
  },

  // Custom log levels for trading bot events
  customLevels: {
    price: 15, // Price updates (between trace and debug)
    opportunity: 25, // Detected opportunities (between debug and info)
    trade: 35, // Trade executions (between info and warn)
  },

  // Serializers for structured logging
  serializers: {
    error: (err: Error) => ({
      type: err.name,
      message: err.message,
      stack: err.stack,
    }),
    transaction: (tx: Record<string, unknown>) => ({
      hash: tx.hash,
      gasUsed: (tx.gasUsed as string | number | undefined)?.toString(),
      gasPrice: (tx.gasPrice as string | number | undefined)?.toString(),
      status: tx.status,
    }),
    opportunity: (opp: {
      pair: string;
      profit?: number | string;
      dexA: string;
      dexB: string;
      chain: string;
    }) => ({
      pair: opp.pair,
      profit: opp.profit?.toString(),
      dexA: opp.dexA,
      dexB: opp.dexB,
      chain: opp.chain,
    }),
  },

  // Redact sensitive information
  redact: {
    paths: ['privateKey', 'mnemonic', 'password', '*.privateKey'],
    remove: true,
  },
};
