import { createPublicClient, http, webSocket, getContract } from 'viem';
import { polygon } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// WMATIC ABI (minimal - just what we need for testing)
const WMATIC_ABI = [
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

interface ChainConfig {
  chainId: number;
  name: string;
  rpcProviders: {
    primary: {
      name: string;
      websocket: string;
      http: string;
      priority: number;
    };
    fallback: Array<{
      name: string;
      websocket: string;
      http: string;
      priority: number;
    }>;
  };
  coreContracts: {
    wrappedNative: string;
  };
}

// Function to resolve environment variables in config strings
function resolveEnvVars(configStr: string): string {
  return configStr.replace(/\$\{(\w+)\}/g, (match, envVar) => {
    const value = process.env[envVar];
    if (!value) {
      throw new Error(`Environment variable ${envVar} not found`);
    }
    return value;
  });
}

// Function to load and parse config
function loadChainConfig(): ChainConfig {
  const configPath = path.join(process.cwd(), 'backend', 'config', 'chains.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at: ${configPath}`);
  }
  
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configContent);
  
  // Get Polygon config (chainId 137)
  const polygonConfig = config['137'];
  if (!polygonConfig) {
    throw new Error('Polygon config (137) not found in chains.json');
  }
  
  return polygonConfig;
}

// Test RPC connection
async function testRpcConnection(name: string, url: string, isWebSocket: boolean = false): Promise<boolean> {
  try {
    console.log(`Testing ${name} ${isWebSocket ? 'WebSocket' : 'HTTP'} connection...`);
    
    const client = createPublicClient({
      chain: polygon,
      transport: isWebSocket ? webSocket(url) : http(url)
    });
    
    // Test basic connection by getting chain ID
    const chainId = await client.getChainId();
    
    if (chainId !== 137) {
      console.error(`❌ ${name}: Wrong chain ID. Expected 137, got ${chainId}`);
      return false;
    }
    
    // Test getting latest block number
    const blockNumber = await client.getBlockNumber();
    console.log(`✅ ${name}: Connected successfully. Latest block: ${blockNumber}`);
    
    return true;
  } catch (error) {
    console.error(`❌ ${name}: Connection failed -`, error.message);
    return false;
  }
}

// Test WPOL contract
async function testWpolContract(rpcUrl: string, wpolAddress: string): Promise<boolean> {
  try {
    console.log(`\nTesting WPOL contract at ${wpolAddress}...`);
    
    const client = createPublicClient({
      chain: polygon,
      transport: http(rpcUrl)
    });
    
    const wpolContract = getContract({
      address: wpolAddress as `0x${string}`,
      abi: WMATIC_ABI,
      client
    });
    
    // Test contract calls
    const symbol = await wpolContract.read.symbol();
    const name = await wpolContract.read.name();
    const decimals = await wpolContract.read.decimals();
    
    console.log(`✅ WPOL Contract Details:`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Name: ${name}`);
    console.log(`   Decimals: ${decimals}`);
    
    if (symbol !== 'WPOL') {
      console.error(`❌ WPOL: Expected symbol 'WPOL', got '${symbol}'`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`❌ WPOL Contract: Test failed -`, error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('🟣 POLYGON CONFIG TEST STARTING...\n');
  
  try {
    // Load config
    const config = loadChainConfig();
    console.log(`📋 Loaded config for: ${config.name} (Chain ID: ${config.chainId})\n`);
    
    let totalTests = 0;
    let passedTests = 0;
    
    // Test Primary Provider (QuickNode)
    const primaryWss = resolveEnvVars(config.rpcProviders.primary.websocket);
    const primaryHttp = resolveEnvVars(config.rpcProviders.primary.http);
    
    totalTests += 2;
    if (await testRpcConnection(config.rpcProviders.primary.name + ' WSS', primaryWss, true)) passedTests++;
    if (await testRpcConnection(config.rpcProviders.primary.name + ' HTTP', primaryHttp, false)) passedTests++;
    
    // Test Fallback Providers
    for (const fallback of config.rpcProviders.fallback) {
      const fallbackWss = resolveEnvVars(fallback.websocket);
      const fallbackHttp = resolveEnvVars(fallback.http);
      
      totalTests += 2;
      if (await testRpcConnection(fallback.name + ' WSS', fallbackWss, true)) passedTests++;
      if (await testRpcConnection(fallback.name + ' HTTP', fallbackHttp, false)) passedTests++;
    }
    
    // Test WPOL Contract (using primary HTTP)
    totalTests += 1;
    if (await testWpolContract(primaryHttp, config.coreContracts.wrappedNative)) passedTests++;
    
    // Results
    console.log(`\n📊 TEST RESULTS:`);
    console.log(`✅ Passed: ${passedTests}/${totalTests} tests`);
    console.log(`❌ Failed: ${totalTests - passedTests}/${totalTests} tests`);
    
    if (passedTests === totalTests) {
      console.log(`\n🎉 ALL TESTS PASSED! Polygon config is ready for use.`);
    } else {
      console.log(`\n⚠️  Some tests failed. Please check the errors above.`);
    }
    
  } catch (error) {
    console.error('💥 Test setup failed:', error.message);
  }
}

// Run tests
runTests().catch(console.error);