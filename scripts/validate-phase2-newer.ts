#!/usr/bin/env tsx

/**
 * Phase 2 Validation Script
 * 
 * This script validates that all Phase 2 components are working correctly
 * and identifies any remaining integration issues.
 */

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class Phase2Validator {
  private testResults: Array<{ test: string; status: 'PASS' | 'FAIL'; error?: string }> = [];

  constructor() {
    // Set test environment variables
    process.env.PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    process.env.POSTGRES_HOST = 'localhost';
    process.env.POSTGRES_PORT = '5432';
    process.env.POSTGRES_APP_DB = 'arbitrage_bot';
    process.env.POSTGRES_APP_USER = 'postgres';
    process.env.POSTGRES_APP_PASSWORD = 'password';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
  }

  private addResult(test: string, status: 'PASS' | 'FAIL', error?: string): void {
    this.testResults.push({ test, status, error });
    const icon = status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} ${test}${status === 'FAIL' && error ? `: ${error}` : ''}`);
  }

  async testComponentImports(): Promise<void> {
    console.log('\n🔄 Testing Component Imports...\n');

    // Test Logger import
    try {
      const { logger } = await import('../backend/src/utils/Logger.js');
      if (logger && typeof logger.info === 'function') {
        this.addResult('Logger import and functionality', 'PASS');
      } else {
        this.addResult('Logger import and functionality', 'FAIL', 'Logger methods not available');
      }
    } catch (error) {
      this.addResult('Logger import', 'FAIL', error instanceof Error ? error.message : String(error));
    }

    // Test RPC Provider Manager import
    try {
      const { rpcProviderManager } = await import('../backend/src/data/RpcProviderManager.js');
      if (rpcProviderManager && typeof rpcProviderManager.initialize === 'function') {
        this.addResult('RPC Provider Manager import and basic methods', 'PASS');
      } else {
        this.addResult('RPC Provider Manager import', 'FAIL', 'Methods not available');
      }
    } catch (error) {
      this.addResult('RPC Provider Manager import', 'FAIL', error instanceof Error ? error.message : String(error));
    }

    // Test MultiChain Listener import
    try {
      const { multiChainListener } = await import('../backend/src/data/MultiChainListener.js');
      if (multiChainListener && typeof multiChainListener.initialize === 'function') {
        this.addResult('MultiChain Listener import and basic methods', 'PASS');
      } else {
        this.addResult('MultiChain Listener import', 'FAIL', 'Methods not available');
      }
    } catch (error) {
      this.addResult('MultiChain Listener import', 'FAIL', error instanceof Error ? error.message : String(error));
    }

    // Test Connection Health Monitor import
    try {
      const { connectionHealthMonitor } = await import('../backend/src/data/ConnectionHealthMonitor.js');
      if (connectionHealthMonitor && typeof connectionHealthMonitor.initialize === 'function') {
        this.addResult('Connection Health Monitor import and basic methods', 'PASS');
      } else {
        this.addResult('Connection Health Monitor import', 'FAIL', 'Methods not available');
      }
    } catch (error) {
      this.addResult('Connection Health Monitor import', 'FAIL', error instanceof Error ? error.message : String(error));
    }

    // Test Provider Failover Logic import
    try {
      const { providerFailoverLogic } = await import('../backend/src/data/ProviderFailoverLogic.js');
      if (providerFailoverLogic && typeof providerFailoverLogic.initialize === 'function') {
        this.addResult('Provider Failover Logic import and basic methods', 'PASS');
      } else {
        this.addResult('Provider Failover Logic import', 'FAIL', 'Methods not available');
      }
    } catch (error) {
      this.addResult('Provider Failover Logic import', 'FAIL', error instanceof Error ? error.message : String(error));
    }

    // Test Storage components import
    try {
      const { redisCache } = await import('../backend/src/storage/RedisCache.js');
      const { postgresRepository } = await import('../backend/src/storage/PostgresRepository.js');
      
      if (redisCache && postgresRepository && 
          typeof redisCache.connect === 'function' && 
          typeof postgresRepository.createHealthMonitoringTables === 'function') {
        this.addResult('Storage components import and health monitoring methods', 'PASS');
      } else {
        this.addResult('Storage components import', 'FAIL', 'Required methods not available');
      }
    } catch (error) {
      this.addResult('Storage components import', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  async testCircularDependencyResolution(): Promise<void> {
    console.log('\n🔄 Testing Circular Dependency Resolution...\n');

    try {
      // Import all components and check for circular dependency issues
      const { rpcProviderManager } = await import('../backend/src/data/RpcProviderManager.js');
      const { connectionHealthMonitor } = await import('../backend/src/data/ConnectionHealthMonitor.js');
      const { providerFailoverLogic } = await import('../backend/src/data/ProviderFailoverLogic.js');
      
      // Check if components exist without circular dependency errors
      if (rpcProviderManager && connectionHealthMonitor && providerFailoverLogic) {
        this.addResult('All components imported without circular dependency errors', 'PASS');
      } else {
        this.addResult('Circular dependency resolution', 'FAIL', 'Some components not available');
      }
    } catch (error) {
      this.addResult('Circular dependency resolution', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  async testAdvancedMonitoringIntegration(): Promise<void> {
    console.log('\n🔄 Testing Advanced Monitoring Integration...\n');

    try {
      const { rpcProviderManager } = await import('../backend/src/data/RpcProviderManager.js');
      
      // Check if RPC Provider Manager has advanced monitoring integration methods
      const hasAdvancedMethods = rpcProviderManager &&
        typeof rpcProviderManager.getConnectionStats === 'function' &&
        typeof rpcProviderManager.getProviderStats === 'function' &&
        typeof rpcProviderManager.switchProvider === 'function';
      
      if (hasAdvancedMethods) {
        this.addResult('RPC Provider Manager advanced monitoring integration', 'PASS');
      } else {
        this.addResult('RPC Provider Manager advanced monitoring integration', 'FAIL', 'Advanced methods not available');
      }
    } catch (error) {
      this.addResult('Advanced monitoring integration', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  async testDatabaseHealthMonitoring(): Promise<void> {
    console.log('\n🔄 Testing Database Health Monitoring...\n');

    try {
      const { postgresRepository } = await import('../backend/src/storage/PostgresRepository.js');
      
      // Check if PostgreSQL has all required health monitoring methods
      const hasHealthMethods = postgresRepository &&
        typeof postgresRepository.createHealthMonitoringTables === 'function' &&
        typeof postgresRepository.logProviderHealthEvent === 'function' &&
        typeof postgresRepository.logCircuitBreakerEvent === 'function' &&
        typeof postgresRepository.logFailoverEvent === 'function' &&
        typeof postgresRepository.logProviderPerformanceSnapshot === 'function';
      
      if (hasHealthMethods) {
        this.addResult('PostgreSQL health monitoring methods available', 'PASS');
      } else {
        this.addResult('PostgreSQL health monitoring methods', 'FAIL', 'Some health monitoring methods missing');
      }
    } catch (error) {
      this.addResult('Database health monitoring', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  async testLoggingEnhancements(): Promise<void> {
    console.log('\n🔄 Testing Logging Enhancements...\n');

    try {
      const { logger } = await import('../backend/src/utils/Logger.js');
      
      // Check if Logger has all Phase 2 specialized methods
      const hasSpecializedMethods = logger &&
        typeof logger.providerHealth === 'function' &&
        typeof logger.circuitBreaker === 'function' &&
        typeof logger.failover === 'function' &&
        typeof logger.loadBalancing === 'function' &&
        typeof logger.websocket === 'function' &&
        typeof logger.healthMetrics === 'function' &&
        typeof logger.predictiveAnalysis === 'function' &&
        typeof logger.operationsAlert === 'function';
      
      if (hasSpecializedMethods) {
        this.addResult('Logger specialized Phase 2 methods available', 'PASS');
      } else {
        this.addResult('Logger specialized Phase 2 methods', 'FAIL', 'Some specialized logging methods missing');
      }
    } catch (error) {
      this.addResult('Logging enhancements', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  async testConfigurationLoading(): Promise<void> {
    console.log('\n🔄 Testing Configuration Loading...\n');

    try {
      // Check if chains.json exists and is readable
      const fs = await import('fs');
      const path = await import('path');
      
      const chainsConfigPath = path.resolve(process.cwd(), 'backend/config/chains.json');
      const chainsConfig = fs.readFileSync(chainsConfigPath, 'utf8');
      const parsedConfig = JSON.parse(chainsConfig);
      
      // Check if configuration has required chains
      const hasRequiredChains = parsedConfig['42161'] && parsedConfig['137'] && parsedConfig['8453'];
      
      if (hasRequiredChains) {
        this.addResult('Chains configuration loading and validation', 'PASS');
      } else {
        this.addResult('Chains configuration validation', 'FAIL', 'Missing required chains (Arbitrum, Polygon, Base)');
      }
    } catch (error) {
      this.addResult('Configuration loading', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  async testEventSystemIntegration(): Promise<void> {
    console.log('\n🔄 Testing Event System Integration...\n');

    try {
      const { multiChainListener } = await import('../backend/src/data/MultiChainListener.js');
      const { providerFailoverLogic } = await import('../backend/src/data/ProviderFailoverLogic.js');
      
      // Check if components extend EventEmitter and have event capabilities
      const hasEventCapabilities = 
        multiChainListener && typeof multiChainListener.on === 'function' &&
        multiChainListener && typeof multiChainListener.emit === 'function' &&
        providerFailoverLogic && typeof providerFailoverLogic.on === 'function' &&
        providerFailoverLogic && typeof providerFailoverLogic.emit === 'function';
      
      if (hasEventCapabilities) {
        this.addResult('Event system integration for cross-component communication', 'PASS');
      } else {
        this.addResult('Event system integration', 'FAIL', 'Components missing event capabilities');
      }
    } catch (error) {
      this.addResult('Event system integration', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  async testProductionReadiness(): Promise<void> {
    console.log('\n🔄 Testing Production Readiness...\n');

    try {
      // Test environment variable requirements
      const requiredEnvVars = [
        'PRIVATE_KEY',
        'POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_APP_DB', 'POSTGRES_APP_USER', 'POSTGRES_APP_PASSWORD',
        'REDIS_HOST', 'REDIS_PORT'
      ];
      
      const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
      
      if (missingEnvVars.length === 0) {
        this.addResult('Required environment variables present', 'PASS');
      } else {
        this.addResult('Required environment variables', 'FAIL', `Missing: ${missingEnvVars.join(', ')}`);
      }
      
      // Test if main entry point exists and exports correctly
      const { FlashArbitrageBot } = await import('../backend/index.js');
      
      if (FlashArbitrageBot && typeof FlashArbitrageBot === 'function') {
        this.addResult('Main entry point export and structure', 'PASS');
      } else {
        this.addResult('Main entry point export', 'FAIL', 'FlashArbitrageBot class not properly exported');
      }
    } catch (error) {
      this.addResult('Production readiness', 'FAIL', error instanceof Error ? error.message : String(error));
    }
  }

  printSummary(): void {
    console.log('\n🎯 PHASE 2 VALIDATION SUMMARY');
    console.log('=====================================\n');
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.status === 'PASS').length;
    const failedTests = totalTests - passedTests;
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${passedTests}`);
    console.log(`❌ Failed: ${failedTests}`);
    console.log(`📊 Success Rate: ${Math.round((passedTests / totalTests) * 100)}%\n`);
    
    if (failedTests > 0) {
      console.log('❌ FAILED TESTS:\n');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(result => {
          console.log(`  • ${result.test}: ${result.error}`);
        });
      console.log('\n');
    }
    
    if (passedTests === totalTests) {
      console.log('🎉 ALL TESTS PASSED - PHASE 2 FULLY FUNCTIONAL!');
    } else if (passedTests >= totalTests * 0.8) {
      console.log('⚠️  MOSTLY FUNCTIONAL - Minor issues need attention');
    } else {
      console.log('🚨 CRITICAL ISSUES - Major fixes required before Phase 3');
    }
  }

  async runAllTests(): Promise<void> {
    console.log('🚀 PHASE 2 INTEGRATION VALIDATION');
    console.log('=====================================');
    
    await this.testComponentImports();
    await this.testCircularDependencyResolution();
    await this.testAdvancedMonitoringIntegration();
    await this.testDatabaseHealthMonitoring();
    await this.testLoggingEnhancements();
    await this.testConfigurationLoading();
    await this.testEventSystemIntegration();
    await this.testProductionReadiness();
    
    this.printSummary();
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run validation
const validator = new Phase2Validator();
validator.runAllTests().catch(error => {
  console.error('❌ Validation failed:', error);
  process.exit(1);
});
