# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository contains a **Progressive MEV Bot** architecture that scales from MacBook profitability to institutional-level performance through systematic phases.

## 🎯 **PROGRESSIVE SCALING APPROACH**
**Target**: $50 daily → $108k+ daily through 6 phases of systematic scaling

**Current Status**: Complete progressive architecture documented and ready for **Phase 1 implementation**.

## 📋 **PROJECT STRUCTURE**

### **📊 PHASE-BASED ARCHITECTURE** (`./phases/`)
- **[Phase 1: Arbitrage](phases/phase1-arbitrage/docs/PHASE1_ARCHITECTURE.md)** - MacBook + RPC, $50-200/day
- **[Phase 2: Liquidations](phases/phase2-liquidations/docs/PHASE2_ARCHITECTURE.md)** - MacBook + RPC, $100-1000/day  
- **[Phase 3: Sandwich](phases/phase3-sandwich/docs/PHASE3_ARCHITECTURE.md)** - Hybrid infrastructure, $500-5000/day
- **[Phase 4: JIT Liquidity](phases/phase4-jit/docs/PHASE4_ARCHITECTURE.md)** - Direct nodes, $2.4k-8.6k/day
- **[Phase 5: Oracle Timing](phases/phase5-oracle/docs/PHASE5_ARCHITECTURE.md)** - Advanced ML, $6.3k-37k/day
- **[Phase 6: Multi-Chain](phases/phase6-multichain/docs/PHASE6_ARCHITECTURE.md)** - Global infrastructure, $17.5k-108k/day

### **🔄 SHARED RESOURCES**
- **Contracts**: `./shared/contracts/` - Smart contract interfaces
- **Configs**: `./shared/config/` - Base configurations for all phases

### **📁 ARCHIVED** (`./Archive/`)
- Old simple/ultimate architectures preserved for reference

## Common Development Commands

### Build & Development
```bash
# Phase 1 Development (START HERE)
cd phases/phase1-arbitrage/
cp .env.example .env  # Copy and configure environment variables
npm install           # Install dependencies
npm run dev          # Start development with hot reload
npm run build        # Build TypeScript to JavaScript  
npm run start        # Run production build
```

### Testing & Quality
```bash
npm test         # Run all tests with Vitest
npm run lint     # Run ESLint checks
npm run lint:fix # Auto-fix ESLint issues
npm run clean    # Clean build artifacts
```

## 🏗️ **CURRENT IMPLEMENTATION STATUS**

### **✅ COMPLETED: Progressive Architecture Documentation**
- Complete 6-phase MEV system design documented
- Phase 1-6 implementation guides created  
- All strategies documented (arbitrage, liquidations, sandwich, JIT, oracle, multi-chain)
- MEV protection strategy clarified for each phase
- Realistic profit projections established

### **🚀 READY FOR: Phase 1 Implementation**
**Current Status**: Phase 1 architecture documented, ready to begin MacBook arbitrage bot

#### **Phase 1 Goals (Cross-DEX Arbitrage)**
- [ ] Setup MacBook development environment
- [ ] Configure RPC providers (QuickNode/Alchemy)
- [ ] Implement cross-DEX price scanning
- [ ] Deploy flash loan arbitrage contracts
- [ ] Achieve $50+ daily profit consistently

#### **Phase 1 Architecture Overview**
- **Infrastructure**: MacBook + RPC providers
- **Strategy**: Cross-DEX arbitrage (Uniswap vs SushiSwap price differences)
- **Execution**: Direct mempool (no MEV protection needed)
- **Target**: $50-200 daily profit
- **Timeline**: 2-4 weeks to profitability
- **Cost**: $50-200/month total

## Phase 1 Implementation Details

### **Core System Design (MacBook-Friendly)**
Phase 1 focuses on learning MEV fundamentals with minimal infrastructure:

1. **SIMPLICITY** - RPC providers, direct mempool, basic arbitrage
2. **LEARNING** - Flash loans, gas optimization, profit calculation  
3. **PROFITABILITY** - Consistent $50-200 daily with cross-DEX arbitrage
4. **CAPITAL BUILDING** - Fund Phase 2 infrastructure upgrades

### **Key Components**

#### Price Scanner (`src/core/`)
- **ArbitrageScanner** - Detect price differences between DEXes
- **ProfitCalculator** - Account for all costs (gas, fees, slippage)
- **GasOptimizer** - Standard gas pricing for reliable execution

#### Execution Engine (`src/execution/`)
- **FlashLoanExecutor** - Aave/Balancer flash loan integration
- **TransactionBuilder** - Atomic arbitrage transaction construction
- **Direct Mempool** - No MEV protection needed for cross-DEX arbitrage

### **Environment Configuration**
Phase 1 configuration lives in `phases/phase1-arbitrage/config/`:
- Chain configurations (`config/chains.json`) - RPC endpoints only
- DEX configurations (`config/dexes.json`) - Uniswap, SushiSwap, etc.
- Flash loan providers (`config/flashLoanProviders.json`) - Aave, Balancer
- Token configurations (`config/tokens.json`) - Major trading pairs
- Private keys and API endpoints (`.env`)

### **Financial Targets & Performance**
- **Daily Profit Target**: $50-200 (Phase 1 goal)
- **Execution Speed**: RPC latency acceptable (50-100ms)
- **Success Rate**: 60%+ of detected opportunities
- **Strategy**: Cross-DEX arbitrage only
- **Capital Requirement**: $0 (flash loans provide all capital)

## Important Implementation Notes

### **Phase 1 Critical Requirements**
1. **MacBook-friendly** - No direct nodes, no complex infrastructure
2. **RPC providers** - QuickNode/Alchemy for blockchain access
3. **Cross-DEX arbitrage** - Price differences between exchanges
4. **Direct mempool** - No MEV protection needed
5. **Flash loans only** - Never risk capital, only gas costs

### **Development Guidelines**
- **Config from files** - All config from `phases/phase1-arbitrage/config/`
- **ESM imports** - Use `.js` extensions in TypeScript imports
- **Simple execution** - Direct mempool submission
- **Atomic execution** - Flash loan + arbitrage in single transaction
- **Cost optimization** - Minimize gas costs and RPC calls

### **Financial Safety**
- **Zero capital risk** - Flash loans provide all trading capital
- **Gas is only cost** - Failed transactions only cost gas (~$5-20)
- **Position limits** - Max 5 ETH equivalent per trade
- **Profit validation** - Simulate before execution

## 🎯 **PHASE 1 IMPLEMENTATION ROADMAP**

### **Week 1: Environment Setup**
1. **Development setup** - Node.js, TypeScript, testing framework
2. **RPC providers** - QuickNode/Alchemy accounts and API keys
3. **Smart contracts** - Deploy arbitrage executor to testnet
4. **Basic scanning** - Implement price difference detection

### **Week 2: Core Implementation**
1. **Flash loan integration** - Aave/Balancer provider integration
2. **Arbitrage logic** - Complete profit calculation and execution
3. **Gas optimization** - Efficient gas pricing for profitability  
4. **Error handling** - Robust failure management

### **Week 3-4: Testing & Optimization**
1. **Testnet testing** - Extensive testing on Sepolia/Goerli
2. **Mainnet deployment** - Start with small amounts
3. **Performance tuning** - Optimize for consistent profitability
4. **Monitoring setup** - Logging, alerts, profit tracking

### **Phase 1 Success Targets**
- **Week 2**: First successful testnet arbitrage
- **Week 3**: First profitable mainnet arbitrage  
- **Week 4**: $50+ daily profit consistently
- **Month 1**: $1,500-6,000 total profit, ready for Phase 2

### **Graduation to Phase 2**
When Phase 1 achieves consistent $50+ daily profit:
- Move to Phase 2: Liquidation hunting
- Add lending protocol monitoring (Aave, Compound)
- Scale to $100-1000 daily with larger opportunities
- Begin building capital for Phase 3 infrastructure

---

**🚀 START HERE: Implement Phase 1 cross-DEX arbitrage bot**
**📚 REFERENCE: `phases/phase1-arbitrage/docs/PHASE1_ARCHITECTURE.md`**