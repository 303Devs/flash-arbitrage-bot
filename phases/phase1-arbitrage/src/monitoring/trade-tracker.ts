import { logger } from './logger.js';

export class TradeTracker {
  private opportunities = 0;
  private executions    = 0;
  private successes     = 0;
  private totalProfit   = 0;
  private totalGasCost  = 0;
  private startTime     = new Date();
  private lastSummary   = new Date();

  recordOpportunity(_profit: number): void {
    this.opportunities++;
    if (this.opportunities % 50 === 0 || this.shouldShowSummary()) {
      this.showSummary();
    }
  }

  recordExecution(success: boolean, profit?: number, gasCost?: number): void {
    this.executions++;
    if (success && profit) {
      this.successes++;
      this.totalProfit += profit;
    }
    if (gasCost) this.totalGasCost += gasCost;
  }

  private shouldShowSummary(): boolean {
    return (Date.now() - this.lastSummary.getTime()) >= 5 * 60 * 1000;
  }

  private showSummary(): void {
    const successRate = this.executions > 0 ? this.successes / this.executions : 0;
    const runtime = Math.floor((Date.now() - this.startTime.getTime()) / 60000);

    logger.summary({
      totalOpportunities: this.opportunities,
      totalExecutions:    this.executions,
      successfulTrades:   this.successes,
      totalProfit:        this.totalProfit,
      totalGasCost:       this.totalGasCost,
      successRate,
    });

    console.log(`⏱️  Runtime: ${runtime}min | Opp/min: ${(this.opportunities / Math.max(runtime, 1)).toFixed(1)}`);
    this.lastSummary = new Date();
  }

  getStats() {
    return {
      opportunities: this.opportunities,
      executions:    this.executions,
      successes:     this.successes,
      successRate:   this.executions > 0 ? this.successes / this.executions : 0,
      netProfit:     this.totalProfit - this.totalGasCost,
      runtimeMinutes: Math.floor((Date.now() - this.startTime.getTime()) / 60000),
    };
  }
}

export const tradeTracker = new TradeTracker();
