# 🎯 ARBITRAGE ENGINE DESIGN - CORE BUSINESS LOGIC

## 📊 **ENGINE OVERVIEW**

### **Purpose**
The Arbitrage Engine is the **core intelligence** of the MEV bot, responsible for detecting, analyzing, and validating profitable arbitrage opportunities across multiple strategies with sub-350ms execution requirements.

### **Core Responsibilities**
- **Event-Driven Detection**: React instantly to DEX Swap/Sync events
- **Mempool Analysis**: Identify MEV opportunities from pending transactions
- **Multi-Strategy Support**: 2-DEX, triangular, sandwich, and frontrun strategies
- **Real-Time Profit Calculation**: Instant profitability analysis with gas optimization
- **Atomic Execution**: Build flash loan transactions for risk-free arbitrage

### **Performance Requirements**
- **Event Processing**: <10ms from blockchain event to opportunity detection
- **Mempool Latency**: <50ms from pending tx to MEV opportunity
- **Execution Speed**: <100ms from detection to transaction broadcast
- **Throughput**: Process 10,000+ events per second across all chains

---

## 🏗️ **ARCHITECTURE DESIGN**

### **Three-Phase Implementation Architecture**
```typescript
// Phase 3A: 2-DEX Arbitrage
interface TwoDexOpportunity {
  type: '2dex';
  tokenPair: TokenPair;
  chainId: number;
  dexA: DexInfo;
  dexB: DexInfo;
  priceA: Price;
  priceB: Price;
  spreadPercentage: number;
  estimatedProfit: BigNumber;
  netProfit: BigNumber;
  gasEstimate: BigNumber;
  flashLoanFee: BigNumber;
  executionPath: ExecutionPath;
}

// Phase 3B: Triangular Arbitrage  
interface TriangularOpportunity {
  type: 'triangular';
  path: [Token, Token, Token, Token]; // A→B→C→A
  chainId: number;
  exchanges: [DexInfo, DexInfo, DexInfo];
  rates: [BigNumber, BigNumber, BigNumber];
  amounts: [BigNumber, BigNumber, BigNumber, BigNumber];
  estimatedProfit: BigNumber;
  netProfit: BigNumber;
  gasEstimate: BigNumber;
  executionBundle: TransactionBundle;
}

// Phase 3C: Cross-Chain Arbitrage
interface CrossChainOpportunity {
  type: 'crosschain';
  token: Token;
  sourceChain: ChainInfo;
  targetChain: ChainInfo;
  sourceDex: DexInfo;
  targetDex: DexInfo;
  priceSource: BigNumber;
  priceTarget: BigNumber;
  bridgeInfo: BridgeInfo;
  estimatedProfit: BigNumber;
  netProfit: BigNumber;
  totalExecutionTime: number;
  executionPlan: CrossChainExecutionPlan;
}
```

### **Event-Driven Engine Architecture**
```typescript
class ModernArbitrageEngine {
  // Event Sources
  private dexEventListener: DexEventListener;
  private mempoolMonitor: MempoolMonitor;
  
  // Detection & Calculation
  private arbitrageDetector: ArbitrageDetector;
  private mevCalculator: MEVOpportunityCalculator;
  
  // Execution
  private flashLoanExecutor: FlashLoanExecutor;
  private mevBundleBuilder: MEVBundleBuilder;
  
  // Real-time event processing
  async processSwapEvent(event: SwapEvent): Promise<void>;
  async processPendingTransaction(tx: PendingTransaction): Promise<void>;
  async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<void>;
}
```

---

## 📈 **PHASE 3A: EVENT-DRIVEN 2-DEX ARBITRAGE**

### **Real-Time Event Processing**
```typescript
class EventDriven2DexDetector {
  constructor() {
    // Subscribe to all DEX events on startup
    this.subscribeToDexEvents();
  }
  
  private subscribeToDexEvents() {
    // Uniswap V3 events
    uniswapV3.on('Swap', this.handleSwapEvent.bind(this));
    // PancakeSwap V3 events  
    pancakeSwapV3.on('Swap', this.handleSwapEvent.bind(this));
    // QuickSwap events
    quickSwap.on('Swap', this.handleSwapEvent.bind(this));
  }
  
  async handleSwapEvent(event: SwapEvent): Promise<void> {
    // Extract price from event
    const newPrice = this.extractPriceFromEvent(event);
    
    // Check arbitrage against all other DEXes instantly
    const opportunities = await this.checkArbitrageOpportunities(
      event.pool, event.token0, event.token1, newPrice, event.chainId
    );
    
    // Execute profitable opportunities immediately
    for (const opp of opportunities) {
      if (opp.netProfit > MIN_PROFIT_USD) {
        this.emit('opportunity', opp);
      }
    }
  }
  
  private async analyzeArbitragePair(
    pair: TradingPair, 
    chainId: number, 
    dexA: string, 
    dexB: string
  ): Promise<TwoDexOpportunity | null> {
    
    // 1. Get current prices from both DEXs
    const [priceA, priceB] = await Promise.all([
      this.priceMonitor.getPrice(dexA, pair, chainId),
      this.priceMonitor.getPrice(dexB, pair, chainId)
    ]);
    
    // 2. Calculate price spread
    const spreadAbs = priceA.price.sub(priceB.price).abs();
    const spreadPercentage = spreadAbs.div(priceA.price).toNumber();
    
    // 3. Check if spread exceeds minimum threshold
    if (spreadPercentage < pair.tradingConfig.minSpread) {
      return null;
    }
    
    // 4. Determine optimal trade direction and amount
    const { buyDex, sellDex, tradeAmount } = this.determineOptimalTrade(
      priceA, priceB, pair
    );
    
    // 5. Calculate all costs and net profit
    const profitAnalysis = await this.calculateNetProfit(
      buyDex, sellDex, tradeAmount, pair, chainId
    );
    
    // 6. Validate profitability
    if (profitAnalysis.netProfit.lte(0)) {
      return null;
    }
    
    return {
      type: '2dex',
      tokenPair: pair,
      chainId,
      dexA: buyDex,
      dexB: sellDex,
      priceA: priceA,
      priceB: priceB,
      spreadPercentage,
      estimatedProfit: profitAnalysis.grossProfit,
      netProfit: profitAnalysis.netProfit,
      gasEstimate: profitAnalysis.gasEstimate,
      flashLoanFee: profitAnalysis.flashLoanFee,
      executionPath: profitAnalysis.executionPath,
      timestamp: Date.now(),
      expirationTime: Date.now() + 30000 // 30 second opportunity window
    };
  }
}
```

### **Profit Calculation Engine**
```typescript
class ProfitCalculator {
  async calculateNetProfit(
    buyDex: DexInfo,
    sellDex: DexInfo, 
    tradeAmount: BigNumber,
    pair: TradingPair,
    chainId: number
  ): Promise<ProfitAnalysis> {
    
    // 1. Calculate gross profit from price difference
    const buyPrice = await this.getExecutionPrice(buyDex, pair.tokenA, pair.tokenB, tradeAmount);
    const sellPrice = await this.getExecutionPrice(sellDex, pair.tokenB, pair.tokenA, tradeAmount);
    const grossProfit = sellPrice.sub(buyPrice);
    
    // 2. Estimate gas costs
    const gasEstimate = await this.estimateGasCosts(buyDex, sellDex, chainId);
    
    // 3. Calculate flash loan fees
    const flashLoanFee = await this.calculateFlashLoanFee(
      pair.tokenA, tradeAmount, chainId
    );
    
    // 4. Account for slippage
    const slippageImpact = this.calculateSlippageImpact(
      tradeAmount, buyDex, sellDex, pair
    );
    
    // 5. Calculate DEX trading fees
    const tradingFees = this.calculateTradingFees(buyDex, sellDex, tradeAmount);
    
    // 6. Net profit calculation
    const totalCosts = gasEstimate.add(flashLoanFee).add(slippageImpact).add(tradingFees);
    const netProfit = grossProfit.sub(totalCosts);
    
    return {
      grossProfit,
      netProfit,
      gasEstimate,
      flashLoanFee,
      slippageImpact,
      tradingFees,
      totalCosts,
      executionPath: this.buildExecutionPath(buyDex, sellDex, tradeAmount)
    };
  }
  
  private async estimateGasCosts(
    buyDex: DexInfo, 
    sellDex: DexInfo, 
    chainId: number
  ): Promise<BigNumber> {
    
    const gasOptimizer = new GasOptimizer();
    const chainConfig = this.getChainConfig(chainId);
    
    // Estimate gas units needed
    const swapGasUnits = buyDex.gasEstimates.swap + sellDex.gasEstimates.swap;
    const flashLoanGasUnits = this.getFlashLoanGasEstimate(chainId);
    const totalGasUnits = swapGasUnits + flashLoanGasUnits;
    
    // Get current gas price
    const gasPrice = await gasOptimizer.getCurrentOptimalGasPrice(chainId);
    
    // Calculate total gas cost in wei
    const gasCostWei = BigNumber.from(totalGasUnits).mul(gasPrice);
    
    // Convert to USD for profit comparison
    const ethPrice = await this.getETHPriceUSD();
    const gasCostUSD = gasCostWei.div(BigNumber.from(10).pow(18)).mul(ethPrice);
    
    return gasCostUSD;
  }
  
  private calculateFlashLoanFee(
    token: Token, 
    amount: BigNumber, 
    chainId: number
  ): BigNumber {
    
    // Get optimal flash loan provider
    const flashLoanManager = new FlashLoanManager();
    const optimalProvider = flashLoanManager.selectOptimalProvider(token, amount, chainId);
    
    // Calculate fee based on provider
    const feeRate = optimalProvider.fee; // e.g., 0.0001 for Balancer (0.01%)
    const feeAmount = amount.mul(BigNumber.from(Math.floor(feeRate * 10000))).div(10000);
    
    return feeAmount;
  }
  
  private calculateSlippageImpact(
    tradeAmount: BigNumber,
    buyDex: DexInfo,
    sellDex: DexInfo, 
    pair: TradingPair
  ): BigNumber {
    
    // Get current liquidity for both DEXs
    const buyLiquidity = this.getDexLiquidity(buyDex, pair);
    const sellLiquidity = this.getDexLiquidity(sellDex, pair);
    
    // Calculate price impact based on trade size vs liquidity
    const buyPriceImpact = this.calculatePriceImpact(tradeAmount, buyLiquidity);
    const sellPriceImpact = this.calculatePriceImpact(tradeAmount, sellLiquidity);
    
    // Convert price impact to USD loss
    const totalPriceImpact = buyPriceImpact.add(sellPriceImpact);
    const slippageLoss = tradeAmount.mul(totalPriceImpact).div(10000);
    
    return slippageLoss;
  }
}
```

### **Mempool MEV Detection**
```typescript
class MempoolMEVDetector {
  async processPendingTransaction(tx: PendingTransaction): Promise<void> {
    // Decode transaction to identify DEX trades
    const decodedTx = await this.decodeTransaction(tx);
    
    if (!this.isDexTrade(decodedTx)) return;
    
    // Calculate sandwich opportunity
    const sandwich = this.calculateSandwichProfit(decodedTx);
    if (sandwich.profitable) {
      this.emit('sandwichOpportunity', {
        victimTx: tx,
        buyBeforeTx: sandwich.buyTx,
        sellAfterTx: sandwich.sellTx,
        estimatedProfit: sandwich.profit,
        gasPrice: tx.gasPrice * 1.1 // Outbid victim
      });
    }
    
    // Check frontrun opportunity
    const frontrun = this.calculateFrontrunProfit(decodedTx);
    if (frontrun.profitable) {
      this.emit('frontrunOpportunity', {
        victimTx: tx,
        frontrunTx: frontrun.tx,
        estimatedProfit: frontrun.profit,
        gasPrice: tx.gasPrice * 1.2 // Higher gas to get ahead
      });
    }
  }
}
```

### **Event-Driven Price Tracking**
```typescript
class EventDrivenPriceTracker {
  private prices: Map<string, PriceData> = new Map();
  
  constructor() {
    // Prices updated ONLY from events, never polled
    this.subscribeToAllDexEvents();
  }
  
  handleSwapEvent(event: SwapEvent) {
    // Extract exact price from swap event
    const price = this.calculatePriceFromSwap(
      event.amount0In,
      event.amount1Out,
      event.decimals0,
      event.decimals1
    );
    
    // Update price cache instantly
    const key = `${event.dex}:${event.token0}:${event.token1}:${event.chainId}`;
    this.prices.set(key, {
      price,
      timestamp: event.blockTimestamp,
      blockNumber: event.blockNumber,
      txHash: event.transactionHash
    });
    
    // Trigger arbitrage check immediately
    this.checkArbitrageAcrossAllDexes(event);
  }
  
  private async fetchFreshPrice(
    dex: string, 
    pair: TradingPair, 
    chainId: number
  ): Promise<PriceData> {
    
    const dexConfig = this.getDexConfig(dex);
    const rpcProvider = this.getRpcProvider(chainId);
    
    switch (dexConfig.type) {
      case 'uniswap_v3':
        return this.getUniswapV3Price(dexConfig, pair, rpcProvider);
      case 'uniswap_v2':
        return this.getUniswapV2Price(dexConfig, pair, rpcProvider);
      case 'balancer':
        return this.getBalancerPrice(dexConfig, pair, rpcProvider);
      case 'curve':
        return this.getCurvePrice(dexConfig, pair, rpcProvider);
      default:
        throw new Error(`Unsupported DEX type: ${dexConfig.type}`);
    }
  }
  
  private async getUniswapV3Price(
    dexConfig: DexConfig,
    pair: TradingPair,
    provider: PublicClient
  ): Promise<PriceData> {
    
    // Use Quoter contract for accurate price including fees
    const quoterContract = this.getContract(dexConfig.addresses.quoter, provider);
    
    const amountIn = pair.tradingConfig.defaultAmount;
    const fee = 3000; // 0.3% fee tier (most common)
    
    try {
      const amountOut = await quoterContract.read.quoteExactInputSingle([
        pair.tokenA.address,
        pair.tokenB.address,
        fee,
        amountIn,
        0 // sqrtPriceLimitX96 (0 = no limit)
      ]);
      
      const price = BigNumber.from(amountOut).div(BigNumber.from(amountIn));
      
      return {
        dex: dexConfig.name,
        tokenA: pair.tokenA,
        tokenB: pair.tokenB,
        price,
        amountIn: BigNumber.from(amountIn),
        amountOut: BigNumber.from(amountOut),
        fee: fee,
        timestamp: Date.now(),
        source: 'quoter_contract'
      };
      
    } catch (error) {
      // Fallback to pool price if quoter fails
      return this.getUniswapV3PoolPrice(dexConfig, pair, provider);
    }
  }
  
  // Parallel price fetching for speed optimization
  async getPricesParallel(
    dexes: string[], 
    pair: TradingPair, 
    chainId: number
  ): Promise<Map<string, PriceData>> {
    
    const pricePromises = dexes.map(async (dex) => {
      try {
        const price = await this.getPrice(dex, pair, chainId);
        return [dex, price] as [string, PriceData];
      } catch (error) {
        console.warn(`Failed to get price from ${dex}:`, error);
        return [dex, null] as [string, PriceData | null];
      }
    });
    
    const results = await Promise.allSettled(pricePromises);
    const prices = new Map<string, PriceData>();
    
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value[1]) {
        prices.set(result.value[0], result.value[1]);
      }
    });
    
    return prices;
  }
}
```

---

## 🔺 **PHASE 3B: TRIANGULAR ARBITRAGE DETECTION**

### **Triangular Path Discovery**
```typescript
class TriangularArbitrageDetector {
  async scanTriangularOpportunities(): Promise<TriangularOpportunity[]> {
    const opportunities: TriangularOpportunity[] = [];
    
    for (const baseToken of this.configuredTokens) {
      for (const chainId of baseToken.enabledChains) {
        const paths = await this.findProfitablePaths(baseToken, chainId);
        opportunities.push(...paths);
      }
    }
    
    return opportunities.sort((a, b) => 
      b.netProfit.sub(a.netProfit).toNumber()
    );
  }
  
  private async findProfitablePaths(
    baseToken: Token, 
    chainId: number
  ): Promise<TriangularOpportunity[]> {
    
    const connectedTokens = this.getConnectedTokens(baseToken, chainId);
    const profitablePaths: TriangularOpportunity[] = [];
    
    for (const tokenB of connectedTokens) {
      for (const tokenC of connectedTokens) {
        if (tokenB.symbol !== tokenC.symbol) {
          const path = await this.analyzeTriangularPath(
            baseToken, tokenB, tokenC, chainId
          );
          
          if (path && path.netProfit.gt(0)) {
            profitablePaths.push(path);
          }
        }
      }
    }
    
    return profitablePaths;
  }
  
  private async analyzeTriangularPath(
    tokenA: Token,
    tokenB: Token, 
    tokenC: Token,
    chainId: number
  ): Promise<TriangularOpportunity | null> {
    
    // Find best exchange rates for each leg: A→B→C→A
    const [bestAB, bestBC, bestCA] = await Promise.all([
      this.findBestExchangeRate(tokenA, tokenB, chainId),
      this.findBestExchangeRate(tokenB, tokenC, chainId),
      this.findBestExchangeRate(tokenC, tokenA, chainId)
    ]);
    
    if (!bestAB || !bestBC || !bestCA) {
      return null; // Missing exchange rates
    }
    
    // Calculate optimal starting amount
    const startAmount = this.calculateOptimalStartAmount(tokenA, chainId);
    
    // Calculate amounts through the path
    const amountB = this.calculateReceiveAmount(startAmount, bestAB.rate, bestAB.fee);
    const amountC = this.calculateReceiveAmount(amountB, bestBC.rate, bestBC.fee);
    const finalAmountA = this.calculateReceiveAmount(amountC, bestCA.rate, bestCA.fee);
    
    // Calculate gross profit
    const grossProfit = finalAmountA.sub(startAmount);
    
    if (grossProfit.lte(0)) {
      return null; // Not profitable before costs
    }
    
    // Calculate all costs
    const gasEstimate = await this.estimateTriangularGasCost(chainId);
    const flashLoanFee = this.calculateFlashLoanFee(tokenA, startAmount, chainId);
    const totalSlippage = this.calculateTriangularSlippage(
      [startAmount, amountB, amountC], [bestAB, bestBC, bestCA]
    );
    
    // Net profit calculation
    const totalCosts = gasEstimate.add(flashLoanFee).add(totalSlippage);
    const netProfit = grossProfit.sub(totalCosts);
    
    if (netProfit.lte(0)) {
      return null; // Not profitable after costs
    }
    
    return {
      type: 'triangular',
      path: [tokenA, tokenB, tokenC, tokenA],
      chainId,
      exchanges: [bestAB.dex, bestBC.dex, bestCA.dex],
      rates: [bestAB.rate, bestBC.rate, bestCA.rate],
      amounts: [startAmount, amountB, amountC, finalAmountA],
      estimatedProfit: grossProfit,
      netProfit,
      gasEstimate,
      executionBundle: await this.buildTriangularBundle(
        [tokenA, tokenB, tokenC, tokenA],
        [bestAB, bestBC, bestCA],
        [startAmount, amountB, amountC]
      ),
      timestamp: Date.now(),
      expirationTime: Date.now() + 15000 // 15 second window for complex trades
    };
  }
  
  private async findBestExchangeRate(
    tokenFrom: Token, 
    tokenTo: Token, 
    chainId: number
  ): Promise<ExchangeRate | null> {
    
    const availableDexes = this.getAvailableDexes(tokenFrom, tokenTo, chainId);
    const ratePromises = availableDexes.map(dex => 
      this.getExchangeRate(dex, tokenFrom, tokenTo, chainId)
    );
    
    const rates = await Promise.allSettled(ratePromises);
    const validRates = rates
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<ExchangeRate>).value)
      .filter(rate => rate !== null);
    
    if (validRates.length === 0) {
      return null;
    }
    
    // Return the best rate (highest output amount)
    return validRates.reduce((best, current) => 
      current.rate.gt(best.rate) ? current : best
    );
  }
}
```

### **Multi-Transaction Bundle Builder**
```typescript
class BundleTransactionBuilder {
  async buildTriangularBundle(
    path: [Token, Token, Token, Token],
    exchanges: [ExchangeRate, ExchangeRate, ExchangeRate],
    amounts: [BigNumber, BigNumber, BigNumber]
  ): Promise<TransactionBundle> {
    
    const transactions: Transaction[] = [];
    
    // 1. Flash loan initiation
    const flashLoanTx = await this.buildFlashLoanTransaction(
      path[0], amounts[0], this.encodeTriangularCalldata(path, exchanges, amounts)
    );
    transactions.push(flashLoanTx);
    
    // Note: The following transactions are executed within the flash loan callback
    // They are encoded as calldata in the flash loan transaction
    
    const bundleMetadata = {
      type: 'triangular_arbitrage',
      path,
      exchanges: exchanges.map(ex => ex.dex),
      expectedProfit: amounts[3].sub(amounts[0]),
      gasLimit: flashLoanTx.gasLimit,
      maxFeePerGas: flashLoanTx.maxFeePerGas,
      maxPriorityFeePerGas: flashLoanTx.maxPriorityFeePerGas
    };
    
    return {
      transactions,
      metadata: bundleMetadata,
      estimatedGas: flashLoanTx.gasLimit,
      deadline: Date.now() + 30000 // 30 second execution window
    };
  }
  
  private encodeTriangularCalldata(
    path: [Token, Token, Token, Token],
    exchanges: [ExchangeRate, ExchangeRate, ExchangeRate], 
    amounts: [BigNumber, BigNumber, BigNumber]
  ): string {
    
    // Encode the sequence of swaps to be executed within flash loan callback
    const swapCalldata = [];
    
    // Swap 1: A → B
    swapCalldata.push(this.encodeSwapCalldata(
      exchanges[0].dex, path[0], path[1], amounts[0], amounts[1]
    ));
    
    // Swap 2: B → C  
    swapCalldata.push(this.encodeSwapCalldata(
      exchanges[1].dex, path[1], path[2], amounts[1], amounts[2]
    ));
    
    // Swap 3: C → A
    swapCalldata.push(this.encodeSwapCalldata(
      exchanges[2].dex, path[2], path[0], amounts[2], amounts[3]
    ));
    
    // Encode all swaps into single calldata payload
    return this.encodeMultiSwapCalldata(swapCalldata);
  }
}
```

---

## 🌉 **PHASE 3C: CROSS-CHAIN ARBITRAGE DETECTION**

### **Cross-Chain Opportunity Scanner**
```typescript
class CrossChainArbitrageDetector {
  async scanCrossChainOpportunities(): Promise<CrossChainOpportunity[]> {
    const opportunities: CrossChainOpportunity[] = [];
    
    for (const token of this.crossChainTokens) {
      for (const sourceChain of token.supportedChains) {
        for (const targetChain of token.supportedChains) {
          if (sourceChain !== targetChain) {
            const opportunity = await this.analyzeCrossChainArbitrage(
              token, sourceChain, targetChain
            );
            
            if (opportunity && opportunity.netProfit.gt(0)) {
              opportunities.push(opportunity);
            }
          }
        }
      }
    }
    
    return opportunities;
  }
  
  private async analyzeCrossChainArbitrage(
    token: Token,
    sourceChainId: number, 
    targetChainId: number
  ): Promise<CrossChainOpportunity | null> {
    
    // Get best prices on both chains
    const [sourcePrice, targetPrice] = await Promise.all([
      this.getBestPriceOnChain(token, sourceChainId),
      this.getBestPriceOnChain(token, targetChainId)
    ]);
    
    if (!sourcePrice || !targetPrice) {
      return null;
    }
    
    // Calculate price difference
    const priceDiff = targetPrice.price.sub(sourcePrice.price).abs();
    const priceDiffPercent = priceDiff.div(sourcePrice.price);
    
    // Get bridge information
    const bridgeInfo = await this.getBridgeInfo(token, sourceChainId, targetChainId);
    if (!bridgeInfo) {
      return null;
    }
    
    // Calculate optimal trade amount
    const tradeAmount = this.calculateOptimalCrossChainAmount(
      token, sourcePrice, targetPrice, bridgeInfo
    );
    
    // Calculate all costs
    const costs = await this.calculateCrossChainCosts(
      token, tradeAmount, sourceChainId, targetChainId, bridgeInfo
    );
    
    // Calculate net profit
    const grossProfit = priceDiff.mul(tradeAmount);
    const netProfit = grossProfit.sub(costs.total);
    
    if (netProfit.lte(0)) {
      return null;
    }
    
    // Build execution plan
    const executionPlan = await this.buildCrossChainExecutionPlan(
      token, tradeAmount, sourceChainId, targetChainId, bridgeInfo
    );
    
    return {
      type: 'crosschain',
      token,
      sourceChain: this.getChainInfo(sourceChainId),
      targetChain: this.getChainInfo(targetChainId),
      sourceDex: sourcePrice.dex,
      targetDex: targetPrice.dex,
      priceSource: sourcePrice.price,
      priceTarget: targetPrice.price,
      bridgeInfo,
      estimatedProfit: grossProfit,
      netProfit,
      totalExecutionTime: executionPlan.estimatedTime,
      executionPlan,
      timestamp: Date.now(),
      expirationTime: Date.now() + 60000 // 1 minute for cross-chain setup
    };
  }
}
```

---

## 🎯 **OPPORTUNITY RANKING & VALIDATION**

### **Intelligent Opportunity Ranking**
```typescript
class OpportunityRanker {
  rankOpportunities(opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
    return opportunities.sort((a, b) => {
      // Primary: Net profit (higher is better)
      const profitDiff = b.netProfit.sub(a.netProfit);
      if (!profitDiff.isZero()) {
        return profitDiff.gt(0) ? 1 : -1;
      }
      
      // Secondary: Execution speed (faster is better)
      const speedScore = this.calculateSpeedScore(a) - this.calculateSpeedScore(b);
      if (speedScore !== 0) {
        return speedScore;
      }
      
      // Tertiary: Risk level (lower is better)
      const riskScore = this.calculateRiskScore(a) - this.calculateRiskScore(b);
      return riskScore;
    });
  }
  
  private calculateSpeedScore(opportunity: ArbitrageOpportunity): number {
    switch (opportunity.type) {
      case '2dex':
        return 100; // Fastest execution
      case 'triangular':
        return 70;  // Medium execution time
      case 'crosschain':
        return 30;  // Slowest due to bridge delays
      default:
        return 0;
    }
  }
  
  private calculateRiskScore(opportunity: ArbitrageOpportunity): number {
    let risk = 0;
    
    // Higher amounts = higher risk
    risk += opportunity.netProfit.div(1000000).toNumber(); // Risk increases with profit size
    
    // Cross-chain has higher risk
    if (opportunity.type === 'crosschain') {
      risk += 50;
    }
    
    // Triangular has medium risk
    if (opportunity.type === 'triangular') {
      risk += 20;
    }
    
    return risk;
  }
}
```

### **Real-Time Opportunity Validation**
```typescript
class OpportunityValidator {
  async validateOpportunity(opportunity: ArbitrageOpportunity): Promise<ValidationResult> {
    const validations = await Promise.all([
      this.validatePriceStillValid(opportunity),
      this.validateLiquidityAvailable(opportunity),
      this.validateGasEstimateAccurate(opportunity),
      this.validateFlashLoanAvailable(opportunity),
      this.validateSlippageAcceptable(opportunity)
    ]);
    
    const allValid = validations.every(result => result.isValid);
    const errors = validations.filter(result => !result.isValid).map(result => result.error);
    
    return {
      isValid: allValid,
      errors,
      confidence: this.calculateConfidenceScore(validations),
      freshness: Date.now() - opportunity.timestamp
    };
  }
  
  private async validatePriceStillValid(opportunity: ArbitrageOpportunity): Promise<ValidationCheck> {
    // Re-fetch current prices and compare
    const currentPrices = await this.getCurrentPrices(opportunity);
    const priceDeviation = this.calculatePriceDeviation(opportunity, currentPrices);
    
    // Allow up to 1% price deviation
    const isValid = priceDeviation < 0.01;
    
    return {
      isValid,
      error: isValid ? null : `Price deviation too high: ${priceDeviation * 100}%`,
      metric: priceDeviation
    };
  }
  
  private async validateLiquidityAvailable(opportunity: ArbitrageOpportunity): Promise<ValidationCheck> {
    // Check if sufficient liquidity exists for the trade size
    const liquidity = await this.checkAvailableLiquidity(opportunity);
    const required = this.getRequiredLiquidity(opportunity);
    
    const isValid = liquidity.gte(required);
    
    return {
      isValid,
      error: isValid ? null : `Insufficient liquidity: ${liquidity.toString()} < ${required.toString()}`,
      metric: liquidity.div(required).toNumber()
    };
  }
}
```

---

## 📊 **PERFORMANCE OPTIMIZATION**

### **Memory & CPU Optimization**
```typescript
class PerformanceOptimizer {
  // Efficient data structures for high-frequency operations
  private priceCache = new Map<string, PriceData>();
  private opportunityPool = new Set<string>(); // Deduplicate opportunities
  private calculationCache = new LRUCache<string, BigNumber>(1000);
  
  // Batch processing for efficiency
  async processPriceUpdates(updates: PriceUpdate[]): Promise<ArbitrageOpportunity[]> {
    const opportunityPromises = updates.map(update => 
      this.findOpportunitiesForUpdate(update)
    );
    
    const opportunityArrays = await Promise.all(opportunityPromises);
    return opportunityArrays.flat();
  }
  
  // Parallel computation for multi-chain scanning
  async scanAllChainsParallel(): Promise<ArbitrageOpportunity[]> {
    const chainPromises = this.configuredChains.map(chainId =>
      this.scanChainForOpportunities(chainId)
    );
    
    const results = await Promise.allSettled(chainPromises);
    const opportunities = results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<ArbitrageOpportunity[]>).value)
      .flat();
    
    return this.deduplicateOpportunities(opportunities);
  }
}
```

---

## 💸 **FLASH LOAN STRATEGY**

### **Intelligent Provider Selection**
```typescript
class FlashLoanManager {
  selectOptimalProvider(token: Token, amount: BigNumber, chainId: number): FlashLoanProvider {
    const availableProviders = this.getAvailableProviders(token, chainId);
    
    // Filter by liquidity availability
    const liquidProviders = availableProviders.filter(provider => 
      provider.getAvailableLiquidity(token).gte(amount)
    );
    
    if (liquidProviders.length === 0) {
      throw new Error(`Insufficient liquidity for ${amount} ${token.symbol}`);
    }
    
    // Sort by total cost (fees + gas)
    return liquidProviders.sort((a, b) => {
      const costA = this.calculateTotalCost(a, token, amount);
      const costB = this.calculateTotalCost(b, token, amount);
      return costA.sub(costB).toNumber();
    })[0];
  }
  
  private calculateTotalCost(
    provider: FlashLoanProvider, 
    token: Token, 
    amount: BigNumber
  ): BigNumber {
    const loanFee = amount.mul(provider.feeRate).div(10000);
    const gasEstimate = provider.getGasEstimate(token);
    const gasPrice = this.getCurrentGasPrice();
    const gasCost = gasEstimate.mul(gasPrice);
    
    return loanFee.add(gasCost);
  }
}
```

### **Provider Configurations**
```typescript
interface FlashLoanProvider {
  name: string;
  feeRate: number; // basis points (e.g., 9 = 0.09%)
  gasEstimate: BigNumber;
  supportedTokens: Token[];
  maxLoanAmount: BigNumber;
  liquiditySource: string;
}

// Provider specifications per chain
const FLASH_LOAN_PROVIDERS = {
  42161: { // Arbitrum
    balancer: {
      name: 'Balancer V2',
      feeRate: 1, // 0.01%
      gasEstimate: BigNumber.from('180000'),
      contractAddress: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      supportedTokens: ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC']
    },
    aave: {
      name: 'Aave V3',
      feeRate: 9, // 0.09%
      gasEstimate: BigNumber.from('220000'),
      contractAddress: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      supportedTokens: ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC', 'ARB']
    }
  },
  137: { // Polygon
    balancer: {
      name: 'Balancer V2',
      feeRate: 1,
      gasEstimate: BigNumber.from('160000'),
      contractAddress: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
      supportedTokens: ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC']
    }
  }
};
```

---

## 🚀 **MODERN MEV ENGINE SUMMARY**

### **Key Differences from Traditional Approaches**

#### **❌ OLD WAY (Polling-Based)**
- Poll DEX contracts every block for prices
- Waste 50+ RPC calls per second
- Always behind real-time market movements
- No visibility into pending transactions
- Vulnerable to being frontrun

#### **✅ NEW WAY (Event-Driven MEV)**
- Subscribe to DEX events for instant updates
- Zero polling, minimal RPC usage
- React to market changes in <10ms
- See opportunities in mempool before execution
- Protected execution via Flashbots/bloXroute

### **Implementation Priorities**
1. **Event Subscriptions First** - Set up WebSocket listeners for all DEXes
2. **Mempool Monitoring** - Watch for sandwich/frontrun opportunities
3. **Flash Loan Integration** - Enable zero-capital arbitrage
4. **MEV Protection** - Route through Flashbots to avoid being frontrun
5. **Performance Monitoring** - Track profits and success rates

### **Expected Performance**
- **Detection Speed**: <10ms from blockchain event
- **Execution Speed**: <100ms from detection to broadcast
- **Success Rate**: 40-70% of attempted arbitrages
- **Daily Profit Target**: $1,000-10,000+ depending on market

This event-driven Arbitrage Engine represents the **state-of-the-art in MEV bot design**, providing the speed and intelligence needed to compete in modern DeFi markets.