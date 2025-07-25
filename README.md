# Flash Arbitrage Bot

A high-performance, zero-capital arbitrage trading bot that exploits price differences across multiple DEXs on Arbitrum, Polygon, and Base networks using flash loans.

## 🎯 **Overview**

This bot automatically detects and executes arbitrage opportunities by:
- **Real-time price monitoring** across 16 DEXs on 3 chains
- **Flash loan execution** requiring zero initial capital
- **MEV protection** through private transaction pools
- **Production monitoring** with Prometheus + Grafana
- **High-performance caching** with Redis

## 🏗️ **Architecture**

```
Flash Arbitrage Bot/
├── 📂 backend/              # TypeScript application logic
│   ├── 📂 config/           # Chain/DEX/token configurations
│   ├── 📂 src/              # Core trading modules
│   │   ├── 📂 arbitrage/    # Price analysis & opportunity detection
│   │   ├── 📂 data/         # Multi-chain data collection
│   │   ├── 📂 execution/    # Transaction building & MEV routing
│   │   ├── 📂 flashloans/   # Flash loan provider adapters
│   │   ├── 📂 storage/      # Redis cache & PostgreSQL persistence
│   │   └── 📂 utils/        # Logging & helper utilities
│   ├── 📄 index.ts          # Application entry point
│   └── 📄 types.d.ts        # TypeScript type definitions
├── 📂 contracts/            # Smart contract workspace (Solidity)
├── 📂 infrastructure/       # Docker container configurations
├── 📂 monitoring/           # Prometheus & Grafana observability stack
├── 📂 tests/                # Test suites
└── 📄 docker-compose.yml    # Complete infrastructure orchestration
```

## 🚀 **Quick Start**

### **Prerequisites**
- Node.js 18+ with pnpm
- Docker & Docker Compose
- API keys for QuickNode, Alchemy, Infura

### **1. Environment Setup**
```bash
cp .env.example .env
# Edit .env with your API keys and configurations
```

### **2. Start Infrastructure**
```bash
docker-compose up -d
```

### **3. Verify Services**
- **Grafana**: http://localhost:3000 (admin/secure_trading_bot_2025)
- **Prometheus**: http://localhost:9090
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### **4. Run Bot (Development)**
```bash
pnpm install
pnpm dev
```

## 📊 **Trading Coverage**

### **Supported Chains**
- **Arbitrum One** (42161) - Primary focus, lowest gas costs
- **Polygon** (137) - High volume, moderate gas costs
- **Base** (8453) - Growing ecosystem, very low gas costs

### **Integrated DEXs (16 total)**
- **Uniswap V3 & V2** - Universal liquidity
- **SushiSwap** - Multi-chain presence
- **Balancer V2** - Weighted pools & flash loans
- **Curve Finance** - Stablecoin optimization
- **QuickSwap** (Polygon) - Native DEX
- **Camelot** (Arbitrum) - Specialized AMM
- **Aerodrome** (Base) - ve(3,3) model

### **Token Pairs by Priority**
1. **Stablecoin Arbitrage**: USDC/USDT/DAI (highest frequency)
2. **ETH Pairs**: WETH/stablecoins (high volume)
3. **Bitcoin Pairs**: WBTC/others (high value)
4. **Chain Tokens**: MATIC, ARB (chain-specific)
5. **DeFi Tokens**: AAVE, UNI, LINK, etc.

## ⚡ **Performance Features**

### **Speed Optimizations**
- **Sub-350ms latency** from opportunity detection to execution
- **WebSocket connections** for real-time price feeds
- **Redis caching** with 4 specialized databases
- **Connection pooling** with automatic failover

### **MEV Protection**
- **Flashbots integration** for private transactions
- **bloXroute networking** for reduced latency
- **Certificate-based authentication**

### **Gas Optimization**
- **Dynamic gas pricing** based on network conditions
- **Chain-specific strategies** (Arbitrum: 5 gwei max, Base: 2 gwei max)
- **Profit threshold enforcement** (minimum 8x gas cost)

## 🛡️ **Security & Risk Management**

### **Financial Safety**
- **Zero trading capital required** - flash loans provide all capital
- **Automatic profit thresholds** prevent unprofitable trades
- **Transaction simulation** before execution
- **Slippage protection** with dynamic limits

### **Operational Security**
- **Environment-driven configuration** - no hardcoded secrets
- **ACL-based Redis authentication**
- **PostgreSQL role-based access control**
- **Comprehensive error handling & logging**

## 📈 **Monitoring & Analytics**

### **Real-time Dashboards**
- **Trading Performance**: Profit tracking, success rates, execution metrics
- **System Health**: Resource utilization, connection status
- **Chain Analysis**: Per-chain performance and gas optimization

### **Data Persistence**
- **Redis**: Hot price data, opportunity caching, duplicate prevention
- **PostgreSQL**: Trade history, performance analytics, system metrics

### **Alerting**
- **Critical**: Bot down, wallet balance low, system failures
- **Warning**: High resource usage, no recent trades, elevated error rates

## 🔧 **Configuration**

### **Environment Variables**
All configuration is environment-driven following Critical Principles:
- **NO HARDCODED VALUES** - Everything via .env
- **SINGLE SOURCE** - Centralized configuration
- **PRODUCTION READY** - Security and performance optimized

Key categories:
- **RPC Endpoints**: QuickNode, Alchemy, Infura WebSocket & HTTP
- **Database**: PostgreSQL connection and performance settings
- **Cache**: Redis configuration with 4-database setup
- **Monitoring**: Prometheus metrics and Grafana dashboards
- **Security**: MEV protection and wallet management

### **Business Logic Configuration**
- **Chains**: Network configurations and gas strategies
- **DEXs**: Router addresses, fees, gas estimates
- **Tokens**: Contract addresses, decimals, priority rankings
- **Flash Loans**: Provider configurations and liquidity sources

## 🧪 **Development**

### **Available Scripts**
```bash
pnpm dev          # Start development server with hot reload
pnpm build        # Build for production
pnpm test         # Run test suite
pnpm test:watch   # Run tests in watch mode
pnpm lint         # Code linting
pnpm format       # Code formatting
```

### **Architecture Principles**
1. **NO HARDCODED VALUES** - Environment-driven configuration
2. **SINGLE SOURCE** - Centralized .env management
3. **BEST PRACTICES** - Enterprise patterns and clean code
4. **PRODUCTION READY** - Security, performance, reliability
5. **CLEAN & DRY** - No duplication, organized structure

## 🏆 **Performance Targets**

- **Latency**: <350ms opportunity detection to execution
- **Success Rate**: >60% of executed trades profitable
- **Daily Volume**: 30-150 arbitrage executions
- **Profit Target**: $400-2,000 daily across all chains
- **Uptime**: >99.5% availability with automatic recovery

## 📚 **Documentation**

- **Infrastructure**: `infrastructure/README.md` - Docker & database setup
- **Monitoring**: `monitoring/README.md` - Prometheus & Grafana configuration
- **API Documentation**: Generated from TypeScript interfaces
- **Trading Logic**: Inline code documentation and architectural decisions

## 🔗 **Key Dependencies**

- **Runtime**: Node.js, TypeScript, pnpm
- **Blockchain**: viem, ethers.js
- **Database**: PostgreSQL with pg, Redis with ioredis
- **Monitoring**: Prometheus (prom-client), Grafana
- **Infrastructure**: Docker, Docker Compose
- **Development**: Vitest, ESLint, Prettier

## ⚠️ **Disclaimer**

This software is for educational and research purposes. Cryptocurrency trading involves substantial risk. Users are responsible for their own trading decisions and any resulting financial outcomes.

---

**Built with ❤️ for the DeFi community**
