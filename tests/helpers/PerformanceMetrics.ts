/**
 * 📊 Performance Measurement Tools
 * 
 * Enterprise-grade performance measurement and analysis utilities for MEV arbitrage bot testing.
 * Provides comprehensive performance monitoring, benchmarking, and optimization insights.
 * 
 * @fileoverview Performance measurement tools for MEV arbitrage bot testing
 * @author Flash Arbitrage Bot Team
 * @version 1.0.0
 * @since 2025-01-26
 */

import { Logger } from '@utils/Logger';
import { performance, PerformanceObserver } from 'perf_hooks';

/**
 * Performance benchmark configuration
 */
export interface BenchmarkConfig {
  name: string;
  iterations: number;
  warmupIterations: number;
  timeoutMs: number;
  memoryTracking: boolean;
  cpuTracking: boolean;
  targetLatency?: number;
  targetThroughput?: number;
}

/**
 * Performance measurement result
 */
export interface PerformanceMeasurement {
  name: string;
  iterations: number;
  totalTimeMs: number;
  averageTimeMs: number;
  minTimeMs: number;
  maxTimeMs: number;
  medianTimeMs: number;
  p95TimeMs: number;
  p99TimeMs: number;
  standardDeviation: number;
  throughputOps: number;
  memoryStats: MemoryStats;
  cpuStats: CpuStats;
  timestamp: Date;
}

/**
 * Memory usage statistics
 */
export interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  peakHeapUsedMB: number;
  gcCount: number;
  gcTimeMs: number;
}

/**
 * CPU usage statistics
 */
export interface CpuStats {
  userCpuMs: number;
  systemCpuMs: number;
  totalCpuMs: number;
  cpuUsagePercent: number;
}

/**
 * Latency distribution analysis
 */
export interface LatencyDistribution {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  p99_9: number;
  min: number;
  max: number;
  mean: number;
  stdDev: number;
}

/**
 * Throughput measurement result
 */
export interface ThroughputMeasurement {
  operationsPerSecond: number;
  requestsPerSecond: number;
  bytesPerSecond: number;
  concurrentOperations: number;
  averageLatencyMs: number;
  errorRate: number;
}

/**
 * Performance comparison result
 */
export interface PerformanceComparison {
  baseline: PerformanceMeasurement;
  current: PerformanceMeasurement;
  improvements: {
    averageTimeMs: number;
    p95TimeMs: number;
    throughputOps: number;
    memoryUsageMB: number;
  };
  regressions: string[];
  summary: string;
}

/**
 * Performance Benchmark Runner
 * 
 * Executes performance benchmarks with comprehensive measurement and analysis
 */
export class PerformanceBenchmark {
  private readonly logger = Logger.getInstance();
  private config: BenchmarkConfig;
  private measurements: number[] = [];
  private memorySnapshots: NodeJS.MemoryUsage[] = [];
  private cpuSnapshots: NodeJS.CpuUsage[] = [];
  private gcObserver: PerformanceObserver | null = null;
  private gcCount = 0;
  private gcTotalTime = 0;

  constructor(config: BenchmarkConfig) {
    this.config = config;
    this.setupGCMonitoring();
  }

  /**
   * Setup garbage collection monitoring
   */
  private setupGCMonitoring(): void {
    if (this.config.memoryTracking) {
      this.gcObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        for (const entry of entries) {
          if (entry.entryType === 'gc') {
            this.gcCount++;
            this.gcTotalTime += entry.duration;
          }
        }
      });

      this.gcObserver.observe({ entryTypes: ['gc'] });
    }
  }

  /**
   * Run performance benchmark
   */
  public async run<T>(
    testFunction: () => Promise<T> | T,
    name?: string
  ): Promise<PerformanceMeasurement> {
    const benchmarkName = name || this.config.name;
    
    this.logger.info('Starting performance benchmark', {
      name: benchmarkName,
      iterations: this.config.iterations,
      warmupIterations: this.config.warmupIterations
    });

    // Clear previous measurements
    this.measurements = [];
    this.memorySnapshots = [];
    this.cpuSnapshots = [];
    this.gcCount = 0;
    this.gcTotalTime = 0;

    // Warmup iterations
    await this.runWarmup(testFunction);

    // Force garbage collection before actual measurements
    if (global.gc) {
      global.gc();
    }

    // Actual benchmark iterations
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    const startCpu = process.cpuUsage();

    for (let i = 0; i < this.config.iterations; i++) {
      await this.runSingleIteration(testFunction, i);
    }

    const endTime = performance.now();
    const endMemory = process.memoryUsage();
    const endCpu = process.cpuUsage(startCpu);

    // Calculate statistics
    const totalTimeMs = endTime - startTime;
    const result = this.calculateStatistics(
      benchmarkName,
      totalTimeMs,
      startMemory,
      endMemory,
      endCpu
    );

    this.logger.info('Performance benchmark complete', {
      name: benchmarkName,
      averageTimeMs: result.averageTimeMs.toFixed(2),
      p95TimeMs: result.p95TimeMs.toFixed(2),
      throughputOps: result.throughputOps.toFixed(2),
      peakMemoryMB: result.memoryStats.peakHeapUsedMB.toFixed(2)
    });

    return result;
  }

  /**
   * Run warmup iterations
   */
  private async runWarmup<T>(testFunction: () => Promise<T> | T): Promise<void> {
    this.logger.debug('Running warmup iterations', { 
      iterations: this.config.warmupIterations 
    });

    for (let i = 0; i < this.config.warmupIterations; i++) {
      try {
        await testFunction();
      } catch (error) {
        this.logger.warn('Warmup iteration failed', { 
          iteration: i, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // Force GC after warmup
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Run single benchmark iteration
   */
  private async runSingleIteration<T>(
    testFunction: () => Promise<T> | T,
    iteration: number
  ): Promise<void> {
    const iterationStart = performance.now();
    const memoryBefore = process.memoryUsage();
    const cpuBefore = process.cpuUsage();

    try {
      await Promise.race([
        Promise.resolve(testFunction()),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Iteration timeout')), this.config.timeoutMs)
        )
      ]);

      const iterationEnd = performance.now();
      const iterationTime = iterationEnd - iterationStart;
      
      this.measurements.push(iterationTime);

      // Track memory and CPU if enabled
      if (this.config.memoryTracking) {
        this.memorySnapshots.push(process.memoryUsage());
      }

      if (this.config.cpuTracking) {
        this.cpuSnapshots.push(process.cpuUsage(cpuBefore));
      }

    } catch (error) {
      this.logger.warn('Benchmark iteration failed', {
        iteration,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Record failed iteration as max timeout
      this.measurements.push(this.config.timeoutMs);
    }
  }

  /**
   * Calculate comprehensive statistics
   */
  private calculateStatistics(
    name: string,
    totalTimeMs: number,
    startMemory: NodeJS.MemoryUsage,
    endMemory: NodeJS.MemoryUsage,
    cpuUsage: NodeJS.CpuUsage
  ): PerformanceMeasurement {
    // Sort measurements for percentile calculations
    const sortedMeasurements = [...this.measurements].sort((a, b) => a - b);

    // Basic statistics
    const totalTime = this.measurements.reduce((sum, time) => sum + time, 0);
    const averageTime = totalTime / this.measurements.length;
    const minTime = Math.min(...this.measurements);
    const maxTime = Math.max(...this.measurements);

    // Percentile calculations
    const median = this.calculatePercentile(sortedMeasurements, 50);
    const p95 = this.calculatePercentile(sortedMeasurements, 95);
    const p99 = this.calculatePercentile(sortedMeasurements, 99);

    // Standard deviation
    const variance = this.measurements.reduce((sum, time) => 
      sum + Math.pow(time - averageTime, 2), 0) / this.measurements.length;
    const standardDeviation = Math.sqrt(variance);

    // Throughput calculation
    const throughputOps = (this.config.iterations / totalTimeMs) * 1000;

    // Memory statistics
    const memoryStats: MemoryStats = {
      heapUsedMB: endMemory.heapUsed / 1024 / 1024,
      heapTotalMB: endMemory.heapTotal / 1024 / 1024,
      externalMB: endMemory.external / 1024 / 1024,
      peakHeapUsedMB: this.memorySnapshots.length > 0
        ? Math.max(...this.memorySnapshots.map(m => m.heapUsed)) / 1024 / 1024
        : endMemory.heapUsed / 1024 / 1024,
      gcCount: this.gcCount,
      gcTimeMs: this.gcTotalTime
    };

    // CPU statistics
    const totalCpuMs = (cpuUsage.user + cpuUsage.system) / 1000;
    const cpuStats: CpuStats = {
      userCpuMs: cpuUsage.user / 1000,
      systemCpuMs: cpuUsage.system / 1000,
      totalCpuMs,
      cpuUsagePercent: (totalCpuMs / totalTimeMs) * 100
    };

    return {
      name,
      iterations: this.config.iterations,
      totalTimeMs,
      averageTimeMs: averageTime,
      minTimeMs: minTime,
      maxTimeMs: maxTime,
      medianTimeMs: median,
      p95TimeMs: p95,
      p99TimeMs: p99,
      standardDeviation,
      throughputOps,
      memoryStats,
      cpuStats,
      timestamp: new Date()
    };
  }

  /**
   * Calculate percentile value
   */
  private calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    if (this.gcObserver) {
      this.gcObserver.disconnect();
      this.gcObserver = null;
    }
  }
}

/**
 * Latency Analyzer
 * 
 * Analyzes latency distributions and provides detailed insights
 */
export class LatencyAnalyzer {
  private readonly logger = Logger.getInstance();

  /**
   * Analyze latency distribution
   */
  public static analyzeLatency(measurements: number[]): LatencyDistribution {
    const sorted = [...measurements].sort((a, b) => a - b);
    const mean = measurements.reduce((sum, val) => sum + val, 0) / measurements.length;
    
    // Calculate standard deviation
    const variance = measurements.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / measurements.length;
    const stdDev = Math.sqrt(variance);

    return {
      p50: this.calculatePercentile(sorted, 50),
      p75: this.calculatePercentile(sorted, 75),
      p90: this.calculatePercentile(sorted, 90),
      p95: this.calculatePercentile(sorted, 95),
      p99: this.calculatePercentile(sorted, 99),
      p99_9: this.calculatePercentile(sorted, 99.9),
      min: Math.min(...measurements),
      max: Math.max(...measurements),
      mean,
      stdDev
    };
  }

  /**
   * Calculate percentile value
   */
  private static calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Detect latency outliers
   */
  public static detectOutliers(measurements: number[]): { outliers: number[]; threshold: number } {
    const sorted = [...measurements].sort((a, b) => a - b);
    const q1 = this.calculatePercentile(sorted, 25);
    const q3 = this.calculatePercentile(sorted, 75);
    const iqr = q3 - q1;
    const threshold = q3 + 1.5 * iqr;

    const outliers = measurements.filter(val => val > threshold);

    return { outliers, threshold };
  }

  /**
   * Analyze latency trends
   */
  public static analyzeTrends(measurements: number[], windowSize: number = 10): {
    trend: 'improving' | 'degrading' | 'stable';
    confidence: number;
    slope: number;
  } {
    if (measurements.length < windowSize * 2) {
      return { trend: 'stable', confidence: 0, slope: 0 };
    }

    const earlyWindow = measurements.slice(0, windowSize);
    const lateWindow = measurements.slice(-windowSize);

    const earlyMean = earlyWindow.reduce((sum, val) => sum + val, 0) / windowSize;
    const lateMean = lateWindow.reduce((sum, val) => sum + val, 0) / windowSize;

    const slope = (lateMean - earlyMean) / windowSize;
    const percentChange = Math.abs(slope / earlyMean) * 100;

    let trend: 'improving' | 'degrading' | 'stable';
    let confidence = Math.min(percentChange / 10, 1); // Normalize to 0-1

    if (slope < -0.1 && percentChange > 5) {
      trend = 'improving';
    } else if (slope > 0.1 && percentChange > 5) {
      trend = 'degrading';
    } else {
      trend = 'stable';
      confidence = 1 - confidence; // For stable, higher confidence means less change
    }

    return { trend, confidence, slope };
  }
}

/**
 * Throughput Analyzer
 * 
 * Measures and analyzes system throughput under various conditions
 */
export class ThroughputAnalyzer {
  private readonly logger = Logger.getInstance();

  /**
   * Measure throughput under increasing load
   */
  public static async measureThroughput<T>(
    testFunction: () => Promise<T>,
    config: {
      initialConcurrency: number;
      maxConcurrency: number;
      stepSize: number;
      durationMs: number;
      rampUpMs: number;
    }
  ): Promise<ThroughputMeasurement[]> {
    const results: ThroughputMeasurement[] = [];

    for (let concurrency = config.initialConcurrency; 
         concurrency <= config.maxConcurrency; 
         concurrency += config.stepSize) {

      const measurement = await this.measureConcurrentThroughput(
        testFunction,
        concurrency,
        config.durationMs,
        config.rampUpMs
      );

      results.push(measurement);

      // Break if error rate becomes too high
      if (measurement.errorRate > 0.1) {
        Logger.getInstance().warn('High error rate detected, stopping throughput test', {
          concurrency,
          errorRate: measurement.errorRate
        });
        break;
      }
    }

    return results;
  }

  /**
   * Measure throughput at specific concurrency level
   */
  private static async measureConcurrentThroughput<T>(
    testFunction: () => Promise<T>,
    concurrency: number,
    durationMs: number,
    rampUpMs: number
  ): Promise<ThroughputMeasurement> {
    const startTime = Date.now();
    const endTime = startTime + durationMs;
    let totalOperations = 0;
    let totalErrors = 0;
    const latencies: number[] = [];

    // Start concurrent workers
    const workers = Array.from({ length: concurrency }, async () => {
      // Ramp up delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * rampUpMs));

      while (Date.now() < endTime) {
        const operationStart = Date.now();
        
        try {
          await testFunction();
          totalOperations++;
          
          const latency = Date.now() - operationStart;
          latencies.push(latency);
        } catch (error) {
          totalErrors++;
        }
      }
    });

    await Promise.all(workers);

    const actualDurationMs = Date.now() - startTime;
    const operationsPerSecond = (totalOperations / actualDurationMs) * 1000;
    const errorRate = totalErrors / (totalOperations + totalErrors);
    const averageLatencyMs = latencies.length > 0 
      ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length 
      : 0;

    return {
      operationsPerSecond,
      requestsPerSecond: operationsPerSecond, // Alias for compatibility
      bytesPerSecond: 0, // Would need to be calculated based on actual data transfer
      concurrentOperations: concurrency,
      averageLatencyMs,
      errorRate
    };
  }

  /**
   * Find optimal concurrency level
   */
  public static async findOptimalConcurrency<T>(
    testFunction: () => Promise<T>,
    config: {
      maxConcurrency: number;
      targetLatency: number;
      maxErrorRate: number;
      testDurationMs: number;
    }
  ): Promise<{ optimalConcurrency: number; measurement: ThroughputMeasurement }> {
    let left = 1;
    let right = config.maxConcurrency;
    let best = { concurrency: 1, measurement: null as ThroughputMeasurement | null };

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      
      const measurement = await this.measureConcurrentThroughput(
        testFunction,
        mid,
        config.testDurationMs,
        1000 // 1 second ramp up
      );

      if (measurement.averageLatencyMs <= config.targetLatency && 
          measurement.errorRate <= config.maxErrorRate) {
        best = { concurrency: mid, measurement };
        left = mid + 1; // Try higher concurrency
      } else {
        right = mid - 1; // Reduce concurrency
      }
    }

    return {
      optimalConcurrency: best.concurrency,
      measurement: best.measurement!
    };
  }
}

/**
 * Performance Comparator
 * 
 * Compares performance measurements and identifies improvements/regressions
 */
export class PerformanceComparator {
  private readonly logger = Logger.getInstance();

  /**
   * Compare two performance measurements
   */
  public static compare(
    baseline: PerformanceMeasurement,
    current: PerformanceMeasurement
  ): PerformanceComparison {
    const improvements = {
      averageTimeMs: this.calculateImprovement(baseline.averageTimeMs, current.averageTimeMs),
      p95TimeMs: this.calculateImprovement(baseline.p95TimeMs, current.p95TimeMs),
      throughputOps: this.calculateImprovement(current.throughputOps, baseline.throughputOps, false),
      memoryUsageMB: this.calculateImprovement(baseline.memoryStats.heapUsedMB, current.memoryStats.heapUsedMB)
    };

    const regressions: string[] = [];

    // Check for significant regressions (>5% degradation)
    if (improvements.averageTimeMs < -5) {
      regressions.push(`Average latency increased by ${Math.abs(improvements.averageTimeMs).toFixed(1)}%`);
    }
    if (improvements.p95TimeMs < -5) {
      regressions.push(`P95 latency increased by ${Math.abs(improvements.p95TimeMs).toFixed(1)}%`);
    }
    if (improvements.throughputOps < -5) {
      regressions.push(`Throughput decreased by ${Math.abs(improvements.throughputOps).toFixed(1)}%`);
    }
    if (improvements.memoryUsageMB < -10) {
      regressions.push(`Memory usage increased by ${Math.abs(improvements.memoryUsageMB).toFixed(1)}%`);
    }

    const summary = this.generateSummary(improvements, regressions);

    return {
      baseline,
      current,
      improvements,
      regressions,
      summary
    };
  }

  /**
   * Calculate percentage improvement
   */
  private static calculateImprovement(
    baseline: number, 
    current: number, 
    lowerIsBetter: boolean = true
  ): number {
    if (baseline === 0) return 0;
    
    const change = lowerIsBetter 
      ? ((baseline - current) / baseline) * 100
      : ((current - baseline) / baseline) * 100;
    
    return change;
  }

  /**
   * Generate comparison summary
   */
  private static generateSummary(
    improvements: PerformanceComparison['improvements'],
    regressions: string[]
  ): string {
    const significantImprovements = Object.entries(improvements)
      .filter(([_, value]) => value > 5)
      .map(([key, value]) => `${key}: +${value.toFixed(1)}%`);

    if (regressions.length > 0) {
      return `Performance regressions detected: ${regressions.join(', ')}`;
    }

    if (significantImprovements.length > 0) {
      return `Performance improvements: ${significantImprovements.join(', ')}`;
    }

    return 'Performance is stable with no significant changes';
  }

  /**
   * Check if performance meets targets
   */
  public static checkTargets(
    measurement: PerformanceMeasurement,
    targets: {
      maxAverageLatencyMs?: number;
      maxP95LatencyMs?: number;
      minThroughputOps?: number;
      maxMemoryUsageMB?: number;
    }
  ): { passed: boolean; failures: string[] } {
    const failures: string[] = [];

    if (targets.maxAverageLatencyMs && measurement.averageTimeMs > targets.maxAverageLatencyMs) {
      failures.push(`Average latency ${measurement.averageTimeMs.toFixed(2)}ms exceeds target ${targets.maxAverageLatencyMs}ms`);
    }

    if (targets.maxP95LatencyMs && measurement.p95TimeMs > targets.maxP95LatencyMs) {
      failures.push(`P95 latency ${measurement.p95TimeMs.toFixed(2)}ms exceeds target ${targets.maxP95LatencyMs}ms`);
    }

    if (targets.minThroughputOps && measurement.throughputOps < targets.minThroughputOps) {
      failures.push(`Throughput ${measurement.throughputOps.toFixed(2)} ops/s below target ${targets.minThroughputOps} ops/s`);
    }

    if (targets.maxMemoryUsageMB && measurement.memoryStats.heapUsedMB > targets.maxMemoryUsageMB) {
      failures.push(`Memory usage ${measurement.memoryStats.heapUsedMB.toFixed(2)}MB exceeds target ${targets.maxMemoryUsageMB}MB`);
    }

    return {
      passed: failures.length === 0,
      failures
    };
  }
}

/**
 * Performance Metrics Utilities
 * 
 * Utility functions for performance measurement and analysis
 */
export class PerformanceMetrics {
  private static readonly logger = Logger.getInstance();

  /**
   * Create default benchmark configurations for different test types
   */
  public static getDefaultConfigs(): Record<string, BenchmarkConfig> {
    return {
      unit: {
        name: 'Unit Test Performance',
        iterations: 100,
        warmupIterations: 10,
        timeoutMs: 1000,
        memoryTracking: true,
        cpuTracking: true,
        targetLatency: 10,
        targetThroughput: 100
      },
      integration: {
        name: 'Integration Test Performance',
        iterations: 50,
        warmupIterations: 5,
        timeoutMs: 5000,
        memoryTracking: true,
        cpuTracking: true,
        targetLatency: 100,
        targetThroughput: 20
      },
      e2e: {
        name: 'E2E Test Performance',
        iterations: 20,
        warmupIterations: 3,
        timeoutMs: 10000,
        memoryTracking: true,
        cpuTracking: true,
        targetLatency: 500,
        targetThroughput: 5
      },
      load: {
        name: 'Load Test Performance',
        iterations: 1000,
        warmupIterations: 50,
        timeoutMs: 30000,
        memoryTracking: true,
        cpuTracking: true,
        targetLatency: 350, // MEV trading requirement
        targetThroughput: 100
      }
    };
  }

  /**
   * Create MEV-specific performance targets
   */
  public static getMevPerformanceTargets() {
    return {
      rpcCall: {
        maxAverageLatencyMs: 200,
        maxP95LatencyMs: 350,
        minThroughputOps: 50,
        maxMemoryUsageMB: 100
      },
      priceUpdate: {
        maxAverageLatencyMs: 100,
        maxP95LatencyMs: 200,
        minThroughputOps: 100,
        maxMemoryUsageMB: 50
      },
      arbitrageDetection: {
        maxAverageLatencyMs: 300,
        maxP95LatencyMs: 500,
        minThroughputOps: 20,
        maxMemoryUsageMB: 200
      },
      transactionExecution: {
        maxAverageLatencyMs: 500,
        maxP95LatencyMs: 1000,
        minThroughputOps: 10,
        maxMemoryUsageMB: 100
      }
    };
  }

  /**
   * Format performance measurement for reporting
   */
  public static formatMeasurement(measurement: PerformanceMeasurement): string {
    return `
Performance Report: ${measurement.name}
=====================================
Iterations: ${measurement.iterations}
Total Time: ${measurement.totalTimeMs.toFixed(2)}ms
Average Time: ${measurement.averageTimeMs.toFixed(2)}ms
Median Time: ${measurement.medianTimeMs.toFixed(2)}ms
P95 Time: ${measurement.p95TimeMs.toFixed(2)}ms
P99 Time: ${measurement.p99TimeMs.toFixed(2)}ms
Min/Max Time: ${measurement.minTimeMs.toFixed(2)}ms / ${measurement.maxTimeMs.toFixed(2)}ms
Standard Deviation: ${measurement.standardDeviation.toFixed(2)}ms
Throughput: ${measurement.throughputOps.toFixed(2)} ops/s

Memory Usage:
- Heap Used: ${measurement.memoryStats.heapUsedMB.toFixed(2)}MB
- Peak Heap: ${measurement.memoryStats.peakHeapUsedMB.toFixed(2)}MB
- GC Count: ${measurement.memoryStats.gcCount}
- GC Time: ${measurement.memoryStats.gcTimeMs.toFixed(2)}ms

CPU Usage:
- Total CPU: ${measurement.cpuStats.totalCpuMs.toFixed(2)}ms
- CPU Usage: ${measurement.cpuStats.cpuUsagePercent.toFixed(2)}%
`;
  }

  /**
   * Export measurement data for external analysis
   */
  public static exportMeasurement(measurement: PerformanceMeasurement): any {
    return {
      name: measurement.name,
      timestamp: measurement.timestamp.toISOString(),
      summary: {
        iterations: measurement.iterations,
        totalTimeMs: measurement.totalTimeMs,
        averageTimeMs: measurement.averageTimeMs,
        medianTimeMs: measurement.medianTimeMs,
        p95TimeMs: measurement.p95TimeMs,
        p99TimeMs: measurement.p99TimeMs,
        throughputOps: measurement.throughputOps
      },
      memory: measurement.memoryStats,
      cpu: measurement.cpuStats,
      raw: {
        minTimeMs: measurement.minTimeMs,
        maxTimeMs: measurement.maxTimeMs,
        standardDeviation: measurement.standardDeviation
      }
    };
  }

  /**
   * Create performance measurement from existing data
   */
  public static createMeasurementFromData(
    name: string,
    measurements: number[],
    memoryStats?: MemoryStats,
    cpuStats?: CpuStats
  ): PerformanceMeasurement {
    const sorted = [...measurements].sort((a, b) => a - b);
    const total = measurements.reduce((sum, val) => sum + val, 0);
    const average = total / measurements.length;
    
    const variance = measurements.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / measurements.length;
    const standardDeviation = Math.sqrt(variance);

    return {
      name,
      iterations: measurements.length,
      totalTimeMs: total,
      averageTimeMs: average,
      minTimeMs: Math.min(...measurements),
      maxTimeMs: Math.max(...measurements),
      medianTimeMs: this.calculatePercentile(sorted, 50),
      p95TimeMs: this.calculatePercentile(sorted, 95),
      p99TimeMs: this.calculatePercentile(sorted, 99),
      standardDeviation,
      throughputOps: (measurements.length / total) * 1000,
      memoryStats: memoryStats || {
        heapUsedMB: 0,
        heapTotalMB: 0,
        externalMB: 0,
        peakHeapUsedMB: 0,
        gcCount: 0,
        gcTimeMs: 0
      },
      cpuStats: cpuStats || {
        userCpuMs: 0,
        systemCpuMs: 0,
        totalCpuMs: 0,
        cpuUsagePercent: 0
      },
      timestamp: new Date()
    };
  }

  /**
   * Calculate percentile value
   */
  private static calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) {
      return sortedArray[lower];
    }
    
    const weight = index - lower;
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }
}
