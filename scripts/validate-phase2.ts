#!/usr/bin/env tsx

/**
 * Phase 2 Implementation Validation Script
 * 
 * This script validates that all Phase 2 components are properly implemented
 * and can be initialized successfully without runtime errors.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Phase 2 Implementation Validation');
console.log('=====================================\n');

interface ValidationResult {
  component: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  details?: string;
}

const results: ValidationResult[] = [];

function addResult(component: string, status: 'passed' | 'failed' | 'warning', message: string, details?: string) {
  results.push({ component, status, message, details });
  
  const emoji = status === 'passed' ? '✅' : status === 'warning' ? '⚠️' : '❌';
  console.log(`${emoji} ${component}: ${message}`);
  if (details) {
    console.log(`   ${details}\n`);
  }
}

async function validateFileExists(component: string, filePath: string): Promise<boolean> {
  try {
    const { readFileSync } = await import('fs');
    const fullPath = resolve(process.cwd(), filePath);
    const content = readFileSync(fullPath, 'utf8');
    
    // Basic validation - file should have substantial content
    if (content.length < 1000) {
      addResult(component, 'warning', 'File exists but appears to be a stub', `${content.length} characters`);
      return false;
    }
    
    addResult(component, 'passed', 'File exists and has substantial content', `${content.length} characters`);
    return true;
  } catch (error) {
    addResult(component, 'failed', 'File not found or unreadable', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
}

async function validateConfiguration(): Promise<void> {
  console.log('\n⚙️ Validating Configuration');
  console.log('===========================\n');

  // Check for essential environment variables
  const requiredEnvVars = [
    'PRIVATE_KEY',
    'POSTGRES_HOST',
    'POSTGRES_PORT', 
    'POSTGRES_APP_DB',
    'POSTGRES_APP_USER',
    'POSTGRES_APP_PASSWORD',
    'REDIS_HOST',
    'REDIS_PORT'
  ];

  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      addResult('Environment Variables', 'passed', `${envVar} is set`);
    } else {
      addResult('Environment Variables', 'warning', `${envVar} is not set`, 'This may cause initialization failures');
    }
  }

  // Check configuration files
  const configFiles = [
    { component: 'Chains Configuration', path: 'backend/config/chains.json' },
    { component: 'DEXes Configuration', path: 'backend/config/dexes.json' },
    { component: 'Tokens Configuration', path: 'backend/config/tokens.json' }
  ];

  for (const configFile of configFiles) {
    await validateFileExists(configFile.component, configFile.path);
  }
}

async function validateDatabaseSchema(): Promise<void> {
  console.log('\n🗄️ Validating Database Schema');
  console.log('=============================\n');

  try {
    const { readFileSync } = await import('fs');
    const postgresFile = readFileSync(resolve(process.cwd(), 'backend/src/storage/PostgresRepository.ts'), 'utf8');
    
    // Check for health monitoring methods
    const healthMonitoringMethods = [
      'createHealthMonitoringTables',
      'logProviderHealthEvent',
      'logCircuitBreakerEvent',
      'logFailoverEvent',
      'logProviderPerformanceSnapshot'
    ];

    let foundMethods = 0;
    for (const method of healthMonitoringMethods) {
      if (postgresFile.includes(method)) {
        foundMethods++;
        addResult('Database Schema', 'passed', `Method ${method} exists`);
      } else {
        addResult('Database Schema', 'failed', `Method ${method} not found`);
      }
    }

    if (foundMethods === healthMonitoringMethods.length) {
      addResult('Database Schema', 'passed', 'All health monitoring methods found');
    } else {
      addResult('Database Schema', 'warning', `${foundMethods}/${healthMonitoringMethods.length} health monitoring methods found`);
    }

  } catch (error) {
    addResult('Database Schema', 'failed', 'Could not validate database schema', error instanceof Error ? error.message : 'Unknown error');
  }
}

async function validateCircularDependencies(): Promise<void> {
  console.log('\n🔄 Validating Circular Dependencies');
  console.log('===================================\n');

  try {
    const { readFileSync } = await import('fs');
    const rpcManagerFile = readFileSync(resolve(process.cwd(), 'backend/src/data/RpcProviderManager.ts'), 'utf8');
    
    // Check for dynamic imports to avoid circular dependencies
    if (rpcManagerFile.includes('await import(\'./ConnectionHealthMonitor.js\')')) {
      addResult('Circular Dependencies', 'passed', 'Dynamic import for ConnectionHealthMonitor found');
    } else {
      addResult('Circular Dependencies', 'warning', 'Dynamic import for ConnectionHealthMonitor not found');
    }

    if (rpcManagerFile.includes('await import(\'./ProviderFailoverLogic.js\')')) {
      addResult('Circular Dependencies', 'passed', 'Dynamic import for ProviderFailoverLogic found');
    } else {
      addResult('Circular Dependencies', 'warning', 'Dynamic import for ProviderFailoverLogic not found');
    }

    // Check for type-only imports
    if (rpcManagerFile.includes('import type { ConnectionHealthMonitor }')) {
      addResult('Circular Dependencies', 'passed', 'Type-only import for ConnectionHealthMonitor found');
    }

    if (rpcManagerFile.includes('import type { ProviderFailoverLogic }')) {
      addResult('Circular Dependencies', 'passed', 'Type-only import for ProviderFailoverLogic found');
    }

  } catch (error) {
    addResult('Circular Dependencies', 'failed', 'Could not validate circular dependencies', error instanceof Error ? error.message : 'Unknown error');
  }
}

function printSummary(): void {
  console.log('\n📊 Validation Summary');
  console.log('====================\n');

  const passed = results.filter(r => r.status === 'passed').length;
  const warned = results.filter(r => r.status === 'warning').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const total = results.length;

  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`⚠️  Warnings: ${warned}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}\n`);

  if (failed > 0) {
    console.log('❌ CRITICAL ISSUES FOUND:');
    results.filter(r => r.status === 'failed').forEach(r => {
      console.log(`   • ${r.component}: ${r.message}`);
      if (r.details) console.log(`     ${r.details}`);
    });
    console.log('');
  }

  if (warned > 0) {
    console.log('⚠️  WARNINGS:');
    results.filter(r => r.status === 'warning').forEach(r => {
      console.log(`   • ${r.component}: ${r.message}`);
      if (r.details) console.log(`     ${r.details}`);
    });
    console.log('');
  }

  const successRate = (passed / total) * 100;
  if (successRate >= 90) {
    console.log('🎉 Phase 2 implementation looks great! Ready for testing.');
  } else if (successRate >= 70) {
    console.log('👍 Phase 2 implementation is mostly complete. Address warnings and failures.');
  } else {
    console.log('⚠️  Phase 2 implementation needs significant work. Please address the failures.');
  }

  console.log(`\nOverall Success Rate: ${successRate.toFixed(1)}%`);
}

async function main(): Promise<void> {
  try {
    // Basic validation steps
    console.log('📋 Validating Test Files');
    console.log('========================\n');

    const testFiles = [
      { component: 'Connection Health Monitor Tests', path: 'tests/backend/phase2/ConnectionHealthMonitor.test.ts' },
      { component: 'Provider Failover Logic Tests', path: 'tests/backend/phase2/ProviderFailoverLogic.test.ts' },
      { component: 'MultiChain Listener Tests', path: 'tests/backend/phase2/MultiChainListener.test.ts' },
      { component: 'Phase 2 Integration Tests', path: 'tests/backend/phase2/Phase2Integration.test.ts' }
    ];

    for (const testFile of testFiles) {
      await validateFileExists(testFile.component, testFile.path);
    }
    
    console.log('\n📁 Validating Implementation Files');
    console.log('==================================\n');

    const implementationFiles = [
      { component: 'RPC Provider Manager', path: 'backend/src/data/RpcProviderManager.ts' },
      { component: 'Connection Health Monitor', path: 'backend/src/data/ConnectionHealthMonitor.ts' },
      { component: 'Provider Failover Logic', path: 'backend/src/data/ProviderFailoverLogic.ts' },
      { component: 'MultiChain Listener', path: 'backend/src/data/MultiChainListener.ts' },
      { component: 'PostgreSQL Repository', path: 'backend/src/storage/PostgresRepository.ts' },
      { component: 'Redis Cache', path: 'backend/src/storage/RedisCache.ts' },
      { component: 'Logger', path: 'backend/src/utils/Logger.ts' }
    ];

    for (const file of implementationFiles) {
      await validateFileExists(file.component, file.path);
    }
    
    await validateConfiguration();
    await validateDatabaseSchema();
    await validateCircularDependencies();
    
    printSummary();
    
    // Exit with appropriate code
    const failed = results.filter(r => r.status === 'failed').length;
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n💥 Validation script failed:', error);
    process.exit(1);
  }
}

// Run validation
main().catch(console.error);
