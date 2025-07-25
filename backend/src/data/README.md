# 🔧 RPC Provider Manager

The **RPC Provider Manager** is the critical infrastructure layer that manages all blockchain connections for the Flash Arbitrage Bot. It provides bulletproof reliability, automatic failover, and performance optimization across multiple chains and providers.

## 🎯 **Core Features**

### **Multi-Chain Support**
- **Arbitrum One (42161)**: Ultra-fast execution (0.25s blocks)
- **Polygon (137)**: Moderate speed with real gas economics
- **Base (8453)**: Fast execution with cheap gas

### **Provider Redundancy**
- **Primary**: QuickNode (highest performance)
- **Fallback 1**: Alchemy (reliable backup)
- **Fallback 2**: Infura (tertiary option)
- **Total**: 9 WebSocket + 9 HTTP connections across 3 chains

### **Automatic Failover**
- **Health Monitoring**: 30-second interval health checks
- **Instant Switching**: <100ms failover for urgent requests
- **Smart Recovery**: Automatic provider restoration when healthy
- **Circuit Breakers**: Prevents cascade failures

### **Performance Optimization**
- **Chain-Specific Tuning**: Custom timeouts per chain
- **Connection Pooling**: Efficient resource management
- **Response Tracking**: Real-time performance metrics
- **Priority Routing**: Best provider selection algorithm

## 🏗️ **Architecture**

```
┌─────────────────────────────────────────────────────┐
│                RPC Provider Manager                 │
├─────────────────────────────────────────────────────┤
│  Chain 42161 (Arbitrum)    │  Chain 137 (Polygon)  │
│  ┌─ QuickNode (Priority 1) │  ┌─ QuickNode (P1)     │
│  ├─ Alchemy (Priority 2)   │  ├─ Alchemy (P2)      │
│  └─ Infura (Priority 3)    │  └─ Infura (P3)       │
│                            │                       │
│  Chain 8453 (Base)         │  Health Monitor       │
│  ┌─ QuickNode (Priority 1) │  ├─ 30s intervals     │
│  ├─ Alchemy (Priority 2)   │  ├─ Auto failover     │
│  └─ Infura (Priority 3)    │  └─ Redis caching     │
└─────────────────────────────────────────────────────┘
```

## 🚀 **Quick Start**

### **Basic Usage**

```typescript
import { rpcProviderManager } from '@data/RpcProviderManager.js';

// Initialize the manager
await rpcProviderManager.initialize();

// Get providers for different chains
const arbitrumProvider = rpcProviderManager.getHttpProvider(42161);
const polygonProvider = rpcProviderManager.getHttpProvider(137);
const baseProvider = rpcProviderManager.getHttpProvider(8453);

// Make blockchain calls
const blockNumber = await arbitrumProvider.getBlockNumber();
const balance = await arbitrumProvider.getBalance({ address: '0x...' });

// Get WebSocket providers for real-time monitoring
const arbitrumWS = rpcProviderManager.getWebSocketProvider(42161);

// Get wallet clients for transactions
const walletClient = rpcProviderManager.getWalletClient(42161);
```

### **Health Monitoring**

```typescript
// Check overall health
const isHealthy = rpcProviderManager.isHealthy();

// Get detailed connection statistics
const stats = rpcProviderManager.getConnectionStats();
console.log(stats);
// [
//   {
//     chainId: 42161,
//     chainName: 'Arbitrum One',
//     totalProviders: 3,
//     healthyProviders: 3,
//     currentProvider: 'QuickNode',
//     averageResponseTime: 250
//   },
//   ...
// ]

// Get provider-specific statistics
const providerStats = rpcProviderManager.getProviderStats(42161);
```

### **Manual Provider Control**

```typescript
// Force switch to next provider
const switched = await rpcProviderManager.switchProvider(42161, 'manual_switch');

// Check which provider is currently active
const connectionStats = rpcProviderManager.getConnectionStats();
const arbitrumStats = connectionStats.find(s => s.chainId === 42161);
console.log(arbitrumStats.currentProvider); // 'Alchemy' (after switch)
```

## 📊 **Monitoring & Analytics**

### **Health Check Metrics**
- **Response Time**: <3s for Arbitrum, <4s for Polygon, <3s for Base
- **Success Rate**: >95% required for healthy status
- **Block Sync**: Must be within 2 blocks of other providers
- **Uptime**: 99.9% target across all providers

### **Redis Integration**
Health metrics are cached in Redis for analytics and monitoring:

```typescript
// Health data structure in Redis
{
  name: 'QuickNode',
  isHealthy: true,
  lastHealthCheck: 1640995200000,
  consecutiveFailures: 0,
  responseTime: 245
}
```

### **Performance Targets**
- **Arbitrum**: <350ms average response time
- **Polygon**: <500ms average response time  
- **Base**: <300ms average response time
- **Failover**: <100ms switching time
- **Recovery**: Automatic within 60 seconds

## 🔧 **Configuration**

The RPC Provider Manager is fully environment-driven with zero hardcoded values.

### **Required Environment Variables**

```bash
# Primary providers (QuickNode)
QUICKNODE_ARBITRUM_WSS=wss://your-arbitrum-endpoint
QUICKNODE_ARBITRUM_HTTP=https://your-arbitrum-endpoint
QUICKNODE_POLYGON_WSS=wss://your-polygon-endpoint
QUICKNODE_POLYGON_HTTP=https://your-polygon-endpoint
QUICKNODE_BASE_WSS=wss://your-base-endpoint
QUICKNODE_BASE_HTTP=https://your-base-endpoint

# Fallback providers (Alchemy)
ALCHEMY_ARBITRUM_WSS=wss://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
ALCHEMY_ARBITRUM_HTTP=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
ALCHEMY_POLYGON_WSS=wss://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
ALCHEMY_POLYGON_HTTP=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
ALCHEMY_BASE_WSS=wss://base-mainnet.g.alchemy.com/v2/YOUR_KEY
ALCHEMY_BASE_HTTP=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY

# Tertiary providers (Infura)
INFURA_ARBITRUM_WSS=wss://arbitrum-mainnet.infura.io/ws/v3/YOUR_KEY
INFURA_ARBITRUM_HTTP=https://arbitrum-mainnet.infura.io/v3/YOUR_KEY
INFURA_POLYGON_WSS=wss://polygon-mainnet.infura.io/ws/v3/YOUR_KEY
INFURA_POLYGON_HTTP=https://polygon-mainnet.infura.io/v3/YOUR_KEY
INFURA_BASE_WSS=wss://base-mainnet.infura.io/ws/v3/YOUR_KEY
INFURA_BASE_HTTP=https://base-mainnet.infura.io/v3/YOUR_KEY

# Wallet configuration
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

## 🧪 **Testing**

### **Unit Tests**
```bash
# Run unit tests
pnpm test tests/backend/data/RpcProviderManager.test.ts
```

### **Integration Tests** 
```bash
# Run integration tests with real providers
pnpm test:integration
```

### **Manual Testing**
```bash
# Run manual test script
pnpm test:rpc
```

### **Test Coverage**
- ✅ Provider initialization and configuration loading
- ✅ Health monitoring and failover logic
- ✅ Environment variable resolution
- ✅ Error handling and recovery
- ✅ Redis integration and caching
- ✅ Real blockchain connectivity
- ✅ Provider switching and statistics

## 🎯 **Success Criteria**

- ✅ **99.9% uptime** across all chains
- ✅ **<100ms failover** time for urgent requests
- ✅ **<350ms average** response time for trading requests  
- ✅ **Zero missed opportunities** due to RPC failures
- ✅ **Automatic recovery** from all single-provider failures
- ✅ **Production-ready** reliability and performance

---

**This is enterprise-grade MEV infrastructure built for serious trading operations.** 💰⚡
