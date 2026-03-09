import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv  = process.env.NODE_ENV  || 'development';

export class Logger {
  private logger: winston.Logger;
  private tradeLogger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: logLevel,
      format: winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.errors({ stack: false })
      ),
      defaultMeta: { service: 'phase1-arbitrage' },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ level, message, timestamp }) =>
              `${timestamp} [${level}]: ${message}`
            )
          ),
          level: 'info',
        }),
      ],
    });

    this.tradeLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'logs/trades.log',
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
      ],
    });

    if (nodeEnv === 'production') {
      this.logger.add(new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }));
      this.logger.add(new winston.transports.File({
        filename: 'logs/debug.log',
        level: 'debug',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      }));
    }
  }

  debug(message: string, meta?: any): void { this.logger.debug(message, meta); }
  info(message:  string, meta?: any): void { this.logger.info(message, meta);  }
  warn(message:  string, meta?: any): void { this.logger.warn(message, meta);  }
  error(message: string, meta?: any): void { this.logger.error(message, meta); }

  opportunity(data: {
    chain: string; pair: string; profit: number; efficiency: number;
    dexA: string; dexB: string; priceA: number; priceB: number;
  }): void {
    const msg = `🎯 OPPORTUNITY | ${data.chain} ${data.pair} | $${data.profit.toFixed(2)} profit | ${data.efficiency.toFixed(1)}x gas | ${data.dexA} → ${data.dexB}`;
    this.logger.info(msg);
    this.tradeLogger.info('OPPORTUNITY_FOUND', { timestamp: new Date().toISOString(), ...data });
  }

  execution(data: {
    txHash: string; success: boolean; profit?: number;
    gasUsed?: number; gasCost?: number; error?: string;
    pair: string; chain: string;
  }): void {
    if (data.success) {
      const net = (data.profit || 0) - (data.gasCost || 0);
      this.logger.info(`✅ SUCCESS | ${data.chain} ${data.pair} | Net: $${net.toFixed(2)} | TX: ${data.txHash.slice(0, 10)}...`);
    } else {
      this.logger.warn(`❌ FAILED | ${data.chain} ${data.pair} | ${data.error || 'Unknown'} | TX: ${data.txHash.slice(0, 10)}...`);
    }
    this.tradeLogger.info('EXECUTION_RESULT', { timestamp: new Date().toISOString(), ...data });
  }

  summary(data: {
    totalOpportunities: number; totalExecutions: number; successfulTrades: number;
    totalProfit: number; totalGasCost: number; successRate: number;
  }): void {
    const net = data.totalProfit - data.totalGasCost;
    this.logger.info(`📊 SUMMARY | Opp: ${data.totalOpportunities} | Exec: ${data.totalExecutions} | Success: ${data.successfulTrades} (${(data.successRate * 100).toFixed(1)}%) | Net: $${net.toFixed(2)}`);
    this.tradeLogger.info('SESSION_SUMMARY', { timestamp: new Date().toISOString(), ...data });
  }

  circuitBreaker(activated: boolean, reason?: string, cooldownMinutes?: number): void {
    if (activated) {
      this.logger.warn(`🚨 CIRCUIT BREAKER | ${reason} | Cooldown: ${cooldownMinutes}min`);
    } else {
      this.logger.info(`✅ CIRCUIT BREAKER RESET`);
    }
  }

  connection(status: 'connected' | 'disconnected' | 'reconnecting', provider: string, chain?: string): void {
    const emoji = status === 'connected' ? '🟢' : status === 'disconnected' ? '🔴' : '🟡';
    this.logger.info(`${emoji} ${provider} ${chain || ''} ${status.toUpperCase()}`);
  }
}

export const logger = new Logger();
