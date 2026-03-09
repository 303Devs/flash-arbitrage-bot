# ⚙️ CONFIGURATION SCHEMAS - ENTERPRISE MEV ARBITRAGE BOT

## 📋 **CONFIGURATION ARCHITECTURE OVERVIEW**

### **Configuration-Driven Design Principles**
- **Single Source of Truth**: Environment variables in `.env` file
- **Zero Hardcoded Values**: Everything configurable via JSON + environment
- **Hot Reloadable**: Configuration changes without system restart
- **Validation**: Schema validation for all configuration files
- **Scalability**: Add new chains/DEXs/tokens via configuration only

### **Configuration File Structure**
```
backend/config/
├── chains.json           # Blockchain network configurations
├── dexes.json            # DEX contract addresses and settings
├── tokens.json           # Token addresses and metadata
├── flashLoanProviders.json  # Flash loan provider configurations
├── tradingPairs.json     # Enabled trading pair combinations
├── gasStrategies.json    # Gas optimization strategies
└── schemas/              # JSON schema validation files
    ├── chains.schema.json
    ├── dexes.schema.json
    ├── tokens.schema.json
    ├── flashLoanProviders.schema.json
    ├── tradingPairs.schema.json
    └── gasStrategies.schema.json
```

---

## 🔗 **CHAINS.JSON CONFIGURATION**

### **Complete Chains Configuration Template**
```json
{
  "42161": {
    "chainId": 42161,
    "name": "Arbitrum One",
    "type": "L2",
    "nativeCurrency": {
      "name": "Ethereum",
      "symbol": "ETH",
      "decimals": 18
    },
    "rpcProviders": {
      "primary": {
        "name": "QuickNode",
        "websocket": "${QUICKNODE_ARBITRUM_WSS}",
        "http": "${QUICKNODE_ARBITRUM_HTTP}",
        "priority": 1,
        "maxRetries": 3
      },
      "fallback": [
        {
          "name": "Alchemy",
          "websocket": "${ALCHEMY_ARBITRUM_WSS}",
          "http": "${ALCHEMY_ARBITRUM_HTTP}",
          "priority": 2,
          "maxRetries": 3
        },
        {
          "name": "Infura",
          "websocket": "${INFURA_ARBITRUM_WSS}",
          "http": "${INFURA_ARBITRUM_HTTP}",
          "priority": 3,
          "maxRetries": 3
        }
      ]
    },
    "coreContracts": {
      "wrappedNative": "${WETH_ARBITRUM}",
      "multicall": "${MULTICALL_ARBITRUM}"
    },
    "gasConfig": {
      "maxGasPrice": "${ARBITRUM_MAX_GAS_PRICE}",
      "baseFeeMultiplier": "${ARBITRUM_BASE_FEE_MULTIPLIER}",
      "priorityFeeMultiplier": "${ARBITRUM_PRIORITY_FEE_MULTIPLIER}",
      "gasLimit": {
        "swap": 300000,
        "flashLoan": 500000,
        "arbitrage": 800000,
        "triangular": 1200000,
        "crossChain": 1500000
      },
      "profitThresholds": {
        "minProfitUSD": "${ARBITRUM_MIN_PROFIT_USD}",
        "gasMultiplier": "${ARBITRUM_GAS_MULTIPLIER}"
      }
    },
    "performance": {
      "averageBlockTime": 0.25,
      "confirmationsRequired": 1,
      "maxBlocksToWait": 20,
      "rpcTimeout": 3000,
      "retryBackoff": [500, 1000, 2000]
    },
    "slippageConfig": {
      "stablecoins": 0.001,  // 0.1%
      "majors": 0.005,       // 0.5%
      "longtail": 0.02,      // 2.0%
      "maxSlippage": 0.05    // 5.0%
    },
    "bridgeConfig": {
      "supported": true,
      "bridges": [
        {
          "name": "Arbitrum Bridge",
          "contract": "${ARBITRUM_BRIDGE_CONTRACT}",
          "estimatedTime": 600,
          "fee": 0.001
        }
      ]
    }
  },
  "137": {
    "chainId": 137,
    "name": "Polygon",
    "type": "L1",
    "nativeCurrency": {
      "name": "MATIC",
      "symbol": "MATIC",
      "decimals": 18
    },
    "rpcProviders": {
      "primary": {
        "name": "QuickNode",
        "websocket": "${QUICKNODE_POLYGON_WSS}",
        "http": "${QUICKNODE_POLYGON_HTTP}",
        "priority": 1,
        "maxRetries": 3
      },
      "fallback": [
        {
          "name": "Alchemy",
          "websocket": "${ALCHEMY_POLYGON_WSS}",
          "http": "${ALCHEMY_POLYGON_HTTP}",
          "priority": 2,
          "maxRetries": 3
        },
        {
          "name": "Infura",
          "websocket": "${INFURA_POLYGON_WSS}",
          "http": "${INFURA_POLYGON_HTTP}",
          "priority": 3,
          "maxRetries": 3
        }
      ]
    },
    "coreContracts": {
      "wrappedNative": "${WMATIC_POLYGON}",
      "multicall": "${MULTICALL_POLYGON}"
    },
    "gasConfig": {
      "maxGasPrice": "${POLYGON_MAX_GAS_PRICE}",
      "baseFeeMultiplier": "${POLYGON_BASE_FEE_MULTIPLIER}",
      "priorityFeeMultiplier": "${POLYGON_PRIORITY_FEE_MULTIPLIER}",
      "gasLimit": {
        "swap": 350000,
        "flashLoan": 550000,
        "arbitrage": 900000,
        "triangular": 1400000,
        "crossChain": 1700000
      },
      "profitThresholds": {
        "minProfitUSD": "${POLYGON_MIN_PROFIT_USD}",
        "gasMultiplier": "${POLYGON_GAS_MULTIPLIER}"
      }
    },
    "performance": {
      "averageBlockTime": 2.1,
      "confirmationsRequired": 1,
      "maxBlocksToWait": 3,
      "rpcTimeout": 4000,
      "retryBackoff": [1000, 2000, 4000]
    },
    "slippageConfig": {
      "stablecoins": 0.002,  // 0.2%
      "majors": 0.01,        // 1.0%
      "longtail": 0.03,      // 3.0%
      "maxSlippage": 0.05    // 5.0%
    },
    "bridgeConfig": {
      "supported": true,
      "bridges": [
        {
          "name": "Polygon Bridge",
          "contract": "${POLYGON_BRIDGE_CONTRACT}",
          "estimatedTime": 1800,
          "fee": 0.002
        }
      ]
    }
  },
  "8453": {
    "chainId": 8453,
    "name": "Base",
    "type": "L2",
    "nativeCurrency": {
      "name": "Ethereum",
      "symbol": "ETH",
      "decimals": 18
    },
    "rpcProviders": {
      "primary": {
        "name": "QuickNode",
        "websocket": "${QUICKNODE_BASE_WSS}",
        "http": "${QUICKNODE_BASE_HTTP}",
        "priority": 1,
        "maxRetries": 3
      },
      "fallback": [
        {
          "name": "Alchemy",
          "websocket": "${ALCHEMY_BASE_WSS}",
          "http": "${ALCHEMY_BASE_HTTP}",
          "priority": 2,
          "maxRetries": 3
        },
        {
          "name": "Infura",
          "websocket": "${INFURA_BASE_WSS}",
          "http": "${INFURA_BASE_HTTP}",
          "priority": 3,
          "maxRetries": 3
        }
      ]
    },
    "coreContracts": {
      "wrappedNative": "${WETH_BASE}",
      "multicall": "${MULTICALL_BASE}"
    },
    "gasConfig": {
      "maxGasPrice": "${BASE_MAX_GAS_PRICE}",
      "baseFeeMultiplier": "${BASE_BASE_FEE_MULTIPLIER}",
      "priorityFeeMultiplier": "${BASE_PRIORITY_FEE_MULTIPLIER}",
      "gasLimit": {
        "swap": 280000,
        "flashLoan": 480000,
        "arbitrage": 750000,
        "triangular": 1100000,
        "crossChain": 1400000
      },
      "profitThresholds": {
        "minProfitUSD": "${BASE_MIN_PROFIT_USD}",
        "gasMultiplier": "${BASE_GAS_MULTIPLIER}"
      }
    },
    "performance": {
      "averageBlockTime": 2.0,
      "confirmationsRequired": 1,
      "maxBlocksToWait": 3,
      "rpcTimeout": 3000,
      "retryBackoff": [500, 1000, 2000]
    },
    "slippageConfig": {
      "stablecoins": 0.001,  // 0.1%
      "majors": 0.005,       // 0.5%
      "longtail": 0.025,     // 2.5%
      "maxSlippage": 0.05    // 5.0%
    },
    "bridgeConfig": {
      "supported": true,
      "bridges": [
        {
          "name": "Base Bridge",
          "contract": "${BASE_BRIDGE_CONTRACT}",
          "estimatedTime": 420,
          "fee": 0.0005
        }
      ]
    }
  }
}
```

---

## 🏪 **DEXES.JSON CONFIGURATION**

### **Complete DEX Configuration Template**
```json
{
  "uniswap_v3": {
    "name": "Uniswap V3",
    "type": "AMM",
    "version": "3",
    "fees": [0.0001, 0.0005, 0.003, 0.01],
    "supportsFlashSwap": true,
    "addresses": {
      "42161": {
        "factory": "${UNISWAP_V3_FACTORY_ARBITRUM}",
        "router": "${UNISWAP_V3_ROUTER_ARBITRUM}",
        "quoter": "${UNISWAP_V3_QUOTER_ARBITRUM}",
        "positionManager": "${UNISWAP_V3_POSITION_MANAGER_ARBITRUM}"
      },
      "137": {
        "factory": "${UNISWAP_V3_FACTORY_POLYGON}",
        "router": "${UNISWAP_V3_ROUTER_POLYGON}",
        "quoter": "${UNISWAP_V3_QUOTER_POLYGON}",
        "positionManager": "${UNISWAP_V3_POSITION_MANAGER_POLYGON}"
      },
      "8453": {
        "factory": "${UNISWAP_V3_FACTORY_BASE}",
        "router": "${UNISWAP_V3_ROUTER_BASE}",
        "quoter": "${UNISWAP_V3_QUOTER_BASE}",
        "positionManager": "${UNISWAP_V3_POSITION_MANAGER_BASE}"
      }
    },
    "gasEstimates": {
      "swap": 150000,
      "flashSwap": 300000
    },
    "priceFunction": "quoteExactInputSingle",
    "slippageTolerance": 0.005,
    "priority": 1
  },
  "uniswap_v2": {
    "name": "Uniswap V2",
    "type": "AMM",
    "version": "2",
    "fees": [0.003],
    "supportsFlashSwap": true,
    "addresses": {
      "42161": {
        "factory": "${UNISWAP_V2_FACTORY_ARBITRUM}",
        "router": "${UNISWAP_V2_ROUTER_ARBITRUM}"
      },
      "137": {
        "factory": "${UNISWAP_V2_FACTORY_POLYGON}",
        "router": "${UNISWAP_V2_ROUTER_POLYGON}"
      },
      "8453": {
        "factory": "${UNISWAP_V2_FACTORY_BASE}",
        "router": "${UNISWAP_V2_ROUTER_BASE}"
      }
    },
    "gasEstimates": {
      "swap": 120000,
      "flashSwap": 250000
    },
    "priceFunction": "getAmountsOut",
    "slippageTolerance": 0.005,
    "priority": 2
  },
  "sushiswap": {
    "name": "SushiSwap",
    "type": "AMM",
    "version": "2",
    "fees": [0.003],
    "supportsFlashSwap": true,
    "addresses": {
      "42161": {
        "factory": "${SUSHISWAP_FACTORY_ARBITRUM}",
        "router": "${SUSHISWAP_ROUTER_ARBITRUM}"
      },
      "137": {
        "factory": "${SUSHISWAP_FACTORY_POLYGON}",
        "router": "${SUSHISWAP_ROUTER_POLYGON}"
      },
      "8453": {
        "factory": "${SUSHISWAP_FACTORY_BASE}",
        "router": "${SUSHISWAP_ROUTER_BASE}"
      }
    },
    "gasEstimates": {
      "swap": 130000,
      "flashSwap": 260000
    },
    "priceFunction": "getAmountsOut",
    "slippageTolerance": 0.005,
    "priority": 3
  },
  "balancer_v2": {
    "name": "Balancer V2",
    "type": "Weighted Pool",
    "version": "2",
    "fees": [0.0001, 0.0005, 0.001, 0.003, 0.01],
    "supportsFlashLoan": true,
    "addresses": {
      "42161": {
        "vault": "${BALANCER_V2_VAULT_ARBITRUM}",
        "router": "${BALANCER_V2_ROUTER_ARBITRUM}"
      },
      "137": {
        "vault": "${BALANCER_V2_VAULT_POLYGON}",
        "router": "${BALANCER_V2_ROUTER_POLYGON}"
      },
      "8453": {
        "vault": "${BALANCER_V2_VAULT_BASE}",
        "router": "${BALANCER_V2_ROUTER_BASE}"
      }
    },
    "gasEstimates": {
      "swap": 140000,
      "flashLoan": 350000
    },
    "priceFunction": "queryBatchSwap",
    "slippageTolerance": 0.005,
    "priority": 4
  },
  "curve": {
    "name": "Curve Finance",
    "type": "Stable Pool",
    "version": "2",
    "fees": [0.0004],
    "supportsFlashLoan": false,
    "addresses": {
      "42161": {
        "registry": "${CURVE_REGISTRY_ARBITRUM}",
        "router": "${CURVE_ROUTER_ARBITRUM}"
      },
      "137": {
        "registry": "${CURVE_REGISTRY_POLYGON}",
        "router": "${CURVE_ROUTER_POLYGON}"
      },
      "8453": {
        "registry": "${CURVE_REGISTRY_BASE}",
        "router": "${CURVE_ROUTER_BASE}"
      }
    },
    "gasEstimates": {
      "swap": 160000
    },
    "priceFunction": "get_dy",
    "slippageTolerance": 0.002,
    "priority": 5
  },
  "quickswap": {
    "name": "QuickSwap",
    "type": "AMM",
    "version": "2",
    "fees": [0.003],
    "supportsFlashSwap": true,
    "addresses": {
      "137": {
        "factory": "${QUICKSWAP_FACTORY_POLYGON}",
        "router": "${QUICKSWAP_ROUTER_POLYGON}"
      }
    },
    "gasEstimates": {
      "swap": 125000,
      "flashSwap": 255000
    },
    "priceFunction": "getAmountsOut",
    "slippageTolerance": 0.005,
    "priority": 6,
    "enabledChains": [137]
  },
  "camelot": {
    "name": "Camelot",
    "type": "AMM",
    "version": "2",
    "fees": [0.003, 0.005],
    "supportsFlashSwap": true,
    "addresses": {
      "42161": {
        "factory": "${CAMELOT_FACTORY_ARBITRUM}",
        "router": "${CAMELOT_ROUTER_ARBITRUM}"
      }
    },
    "gasEstimates": {
      "swap": 135000,
      "flashSwap": 265000
    },
    "priceFunction": "getAmountsOut",
    "slippageTolerance": 0.005,
    "priority": 7,
    "enabledChains": [42161]
  },
  "aerodrome": {
    "name": "Aerodrome",
    "type": "AMM",
    "version": "2",
    "fees": [0.0005, 0.003],
    "supportsFlashSwap": true,
    "addresses": {
      "8453": {
        "factory": "${AERODROME_FACTORY_BASE}",
        "router": "${AERODROME_ROUTER_BASE}"
      }
    },
    "gasEstimates": {
      "swap": 120000,
      "flashSwap": 240000
    },
    "priceFunction": "getAmountsOut",
    "slippageTolerance": 0.005,
    "priority": 8,
    "enabledChains": [8453]
  }
}
```

---

## 🪙 **TOKENS.JSON CONFIGURATION**

### **Complete Token Configuration Template**
```json
{
  "USDC": {
    "symbol": "USDC",
    "name": "USD Coin",
    "decimals": 6,
    "type": "stablecoin",
    "priority": 1,
    "addresses": {
      "42161": "${USDC_ARBITRUM}",
      "137": "${USDC_POLYGON}",
      "8453": "${USDC_BASE}"
    },
    "tradingConfig": {
      "minTradeSize": "1000000",      // $1
      "maxTradeSize": "100000000000", // $100,000
      "defaultTradeSize": "10000000000", // $10,000
      "slippageTolerance": 0.001,     // 0.1%
      "priceImpactThreshold": 0.005   // 0.5%
    },
    "flashLoanConfig": {
      "supported": true,
      "maxLoanAmount": {
        "aave": "50000000000000",      // $50M
        "balancer": "25000000000000",  // $25M
        "uniswap": "10000000000000"    // $10M
      }
    }
  },
  "USDT": {
    "symbol": "USDT",
    "name": "Tether USD",
    "decimals": 6,
    "type": "stablecoin",
    "priority": 2,
    "addresses": {
      "42161": "${USDT_ARBITRUM}",
      "137": "${USDT_POLYGON}",
      "8453": "${USDT_BASE}"
    },
    "tradingConfig": {
      "minTradeSize": "1000000",
      "maxTradeSize": "100000000000",
      "defaultTradeSize": "10000000000",
      "slippageTolerance": 0.001,
      "priceImpactThreshold": 0.005
    },
    "flashLoanConfig": {
      "supported": true,
      "maxLoanAmount": {
        "aave": "40000000000000",
        "balancer": "20000000000000",
        "uniswap": "8000000000000"
      }
    }
  },
  "DAI": {
    "symbol": "DAI",
    "name": "Dai Stablecoin",
    "decimals": 18,
    "type": "stablecoin",
    "priority": 3,
    "addresses": {
      "42161": "${DAI_ARBITRUM}",
      "137": "${DAI_POLYGON}",
      "8453": "${DAI_BASE}"
    },
    "tradingConfig": {
      "minTradeSize": "1000000000000000000",      // 1 DAI
      "maxTradeSize": "100000000000000000000000", // 100,000 DAI
      "defaultTradeSize": "10000000000000000000000", // 10,000 DAI
      "slippageTolerance": 0.001,
      "priceImpactThreshold": 0.005
    },
    "flashLoanConfig": {
      "supported": true,
      "maxLoanAmount": {
        "aave": "30000000000000000000000000",
        "balancer": "15000000000000000000000000",
        "uniswap": "6000000000000000000000000"
      }
    }
  },
  "WETH": {
    "symbol": "WETH",
    "name": "Wrapped Ethereum",
    "decimals": 18,
    "type": "major",
    "priority": 4,
    "addresses": {
      "42161": "${WETH_ARBITRUM}",
      "137": "${WETH_POLYGON}",
      "8453": "${WETH_BASE}"
    },
    "tradingConfig": {
      "minTradeSize": "1000000000000000",         // 0.001 ETH
      "maxTradeSize": "100000000000000000000",    // 100 ETH
      "defaultTradeSize": "5000000000000000000",  // 5 ETH
      "slippageTolerance": 0.005,
      "priceImpactThreshold": 0.01
    },
    "flashLoanConfig": {
      "supported": true,
      "maxLoanAmount": {
        "aave": "10000000000000000000000",
        "balancer": "5000000000000000000000",
        "uniswap": "2000000000000000000000"
      }
    }
  },
  "WBTC": {
    "symbol": "WBTC",
    "name": "Wrapped Bitcoin",
    "decimals": 8,
    "type": "major",
    "priority": 5,
    "addresses": {
      "42161": "${WBTC_ARBITRUM}",
      "137": "${WBTC_POLYGON}",
      "8453": "${WBTC_BASE}"
    },
    "tradingConfig": {
      "minTradeSize": "10000",          // 0.0001 BTC
      "maxTradeSize": "1000000000",     // 10 BTC
      "defaultTradeSize": "50000000",   // 0.5 BTC
      "slippageTolerance": 0.005,
      "priceImpactThreshold": 0.01
    },
    "flashLoanConfig": {
      "supported": true,
      "maxLoanAmount": {
        "aave": "500000000",
        "balancer": "250000000",
        "uniswap": "100000000"
      }
    }
  },
  "MATIC": {
    "symbol": "MATIC",
    "name": "Polygon",
    "decimals": 18,
    "type": "chain_token",
    "priority": 6,
    "addresses": {
      "137": "${MATIC_POLYGON}",
      "42161": "${MATIC_ARBITRUM}",
      "8453": "${MATIC_BASE}"
    },
    "tradingConfig": {
      "minTradeSize": "1000000000000000000",     // 1 MATIC
      "maxTradeSize": "1000000000000000000000",  // 1,000 MATIC
      "defaultTradeSize": "100000000000000000000", // 100 MATIC
      "slippageTolerance": 0.01,
      "priceImpactThreshold": 0.02
    },
    "flashLoanConfig": {
      "supported": true,
      "maxLoanAmount": {
        "aave": "1000000000000000000000000",
        "balancer": "500000000000000000000000"
      }
    }
  },
  "ARB": {
    "symbol": "ARB",
    "name": "Arbitrum",
    "decimals": 18,
    "type": "chain_token",
    "priority": 7,
    "addresses": {
      "42161": "${ARB_ARBITRUM}",
      "137": "${ARB_POLYGON}",
      "8453": "${ARB_BASE}"
    },
    "tradingConfig": {
      "minTradeSize": "1000000000000000000",
      "maxTradeSize": "1000000000000000000000",
      "defaultTradeSize": "100000000000000000000",
      "slippageTolerance": 0.01,
      "priceImpactThreshold": 0.02
    },
    "flashLoanConfig": {
      "supported": true,
      "maxLoanAmount": {
        "aave": "1000000000000000000000000",
        "balancer": "500000000000000000000000"
      }
    }
  }
}
```

---

## 💰 **FLASHLOANPROVIDERS.JSON CONFIGURATION**

### **Complete Flash Loan Provider Configuration**
```json
{
  "balancer": {
    "name": "Balancer V2",
    "type": "flash_loan",
    "fee": 0.0001,
    "priority": 1,
    "addresses": {
      "42161": "${BALANCER_V2_VAULT_ARBITRUM}",
      "137": "${BALANCER_V2_VAULT_POLYGON}",
      "8453": "${BALANCER_V2_VAULT_BASE}"
    },
    "supportedTokens": ["USDC", "USDT", "DAI", "WETH", "WBTC"],
    "gasEstimate": 350000,
    "maxLoanAmounts": {
      "USDC": {
        "42161": "50000000000000",  // $50M
        "137": "30000000000000",   // $30M
        "8453": "20000000000000"   // $20M
      },
      "WETH": {
        "42161": "20000000000000000000000",
        "137": "15000000000000000000000",
        "8453": "10000000000000000000000"
      }
    },
    "healthCheck": {
      "enabled": true,
      "interval": 30000,
      "timeout": 5000
    }
  },
  "aave": {
    "name": "Aave V3",
    "type": "flash_loan",
    "fee": 0.0009,
    "priority": 2,
    "addresses": {
      "42161": "${AAVE_V3_POOL_ARBITRUM}",
      "137": "${AAVE_V3_POOL_POLYGON}",
      "8453": "${AAVE_V3_POOL_BASE}"
    },
    "supportedTokens": ["USDC", "USDT", "DAI", "WETH", "WBTC", "MATIC", "ARB"],
    "gasEstimate": 400000,
    "maxLoanAmounts": {
      "USDC": {
        "42161": "100000000000000",
        "137": "80000000000000",
        "8453": "60000000000000"
      },
      "WETH": {
        "42161": "40000000000000000000000",
        "137": "30000000000000000000000",
        "8453": "25000000000000000000000"
      }
    },
    "healthCheck": {
      "enabled": true,
      "interval": 30000,
      "timeout": 5000
    }
  },
  "uniswap_v3": {
    "name": "Uniswap V3 Flash",
    "type": "flash_swap",
    "fee": 0.0005,
    "priority": 3,
    "addresses": {
      "42161": "${UNISWAP_V3_FACTORY_ARBITRUM}",
      "137": "${UNISWAP_V3_FACTORY_POLYGON}",
      "8453": "${UNISWAP_V3_FACTORY_BASE}"
    },
    "supportedTokens": ["USDC", "USDT", "DAI", "WETH", "WBTC"],
    "gasEstimate": 300000,
    "maxLoanAmounts": {
      "USDC": {
        "42161": "25000000000000",
        "137": "20000000000000",
        "8453": "15000000000000"
      },
      "WETH": {
        "42161": "10000000000000000000000",
        "137": "8000000000000000000000",
        "8453": "6000000000000000000000"
      }
    },
    "healthCheck": {
      "enabled": true,
      "interval": 30000,
      "timeout": 5000
    }
  },
  "uniswap_v2": {
    "name": "Uniswap V2 Flash",
    "type": "flash_swap",
    "fee": 0.003,
    "priority": 4,
    "addresses": {
      "42161": "${UNISWAP_V2_FACTORY_ARBITRUM}",
      "137": "${UNISWAP_V2_FACTORY_POLYGON}",
      "8453": "${UNISWAP_V2_FACTORY_BASE}"
    },
    "supportedTokens": ["USDC", "USDT", "DAI", "WETH"],
    "gasEstimate": 250000,
    "maxLoanAmounts": {
      "USDC": {
        "42161": "15000000000000",
        "137": "12000000000000",
        "8453": "10000000000000"
      },
      "WETH": {
        "42161": "5000000000000000000000",
        "137": "4000000000000000000000",
        "8453": "3000000000000000000000"
      }
    },
    "healthCheck": {
      "enabled": true,
      "interval": 30000,
      "timeout": 5000
    }
  }
}
```

---

## 🎯 **TRADINGPAIRS.JSON CONFIGURATION**

### **Complete Trading Pairs Configuration**
```json
{
  "USDC_USDT": {
    "tokenA": "USDC",
    "tokenB": "USDT",
    "type": "stablecoin_pair",
    "priority": 1,
    "enabledChains": [42161, 137, 8453],
    "enabledDexes": ["uniswap_v3", "uniswap_v2", "sushiswap", "balancer_v2", "curve"],
    "tradingConfig": {
      "minSpread": 0.0001,           // 0.01%
      "maxSlippage": 0.001,          // 0.1%
      "defaultAmount": "10000000000", // $10,000
      "maxAmount": "100000000000000"  // $100M
    },
    "flashLoanConfig": {
      "preferredProvider": "balancer",
      "fallbackProviders": ["aave", "uniswap_v3"]
    },
    "gasConfig": {
      "maxGasPrice": {
        "42161": "5000000000",
        "137": "50000000000",
        "8453": "2000000000"
      }
    }
  },
  "USDC_DAI": {
    "tokenA": "USDC",
    "tokenB": "DAI",
    "type": "stablecoin_pair",
    "priority": 2,
    "enabledChains": [42161, 137, 8453],
    "enabledDexes": ["uniswap_v3", "uniswap_v2", "sushiswap", "balancer_v2", "curve"],
    "tradingConfig": {
      "minSpread": 0.0001,
      "maxSlippage": 0.001,
      "defaultAmount": "10000000000",
      "maxAmount": "100000000000000"
    },
    "flashLoanConfig": {
      "preferredProvider": "balancer",
      "fallbackProviders": ["aave", "uniswap_v3"]
    }
  },
  "USDT_DAI": {
    "tokenA": "USDT",
    "tokenB": "DAI",
    "type": "stablecoin_pair",
    "priority": 3,
    "enabledChains": [42161, 137, 8453],
    "enabledDexes": ["uniswap_v3", "uniswap_v2", "sushiswap", "balancer_v2", "curve"],
    "tradingConfig": {
      "minSpread": 0.0001,
      "maxSlippage": 0.001,
      "defaultAmount": "10000000000",
      "maxAmount": "100000000000000"
    },
    "flashLoanConfig": {
      "preferredProvider": "balancer",
      "fallbackProviders": ["aave", "uniswap_v3"]
    }
  },
  "WETH_USDC": {
    "tokenA": "WETH",
    "tokenB": "USDC",
    "type": "major_pair",
    "priority": 4,
    "enabledChains": [42161, 137, 8453],
    "enabledDexes": ["uniswap_v3", "uniswap_v2", "sushiswap", "balancer_v2"],
    "tradingConfig": {
      "minSpread": 0.005,            // 0.5%
      "maxSlippage": 0.01,           // 1.0%
      "defaultAmount": "5000000000000000000", // 5 ETH
      "maxAmount": "1000000000000000000000"   // 1000 ETH
    },
    "flashLoanConfig": {
      "preferredProvider": "balancer",
      "fallbackProviders": ["aave", "uniswap_v3"]
    }
  },
  "WETH_USDT": {
    "tokenA": "WETH",
    "tokenB": "USDT",
    "type": "major_pair",
    "priority": 5,
    "enabledChains": [42161, 137, 8453],
    "enabledDexes": ["uniswap_v3", "uniswap_v2", "sushiswap", "balancer_v2"],
    "tradingConfig": {
      "minSpread": 0.005,
      "maxSlippage": 0.01,
      "defaultAmount": "5000000000000000000",
      "maxAmount": "1000000000000000000000"
    }
  },
  "WBTC_USDC": {
    "tokenA": "WBTC",
    "tokenB": "USDC",
    "type": "major_pair",
    "priority": 6,
    "enabledChains": [42161, 137, 8453],
    "enabledDexes": ["uniswap_v3", "uniswap_v2", "sushiswap", "balancer_v2"],
    "tradingConfig": {
      "minSpread": 0.005,
      "maxSlippage": 0.01,
      "defaultAmount": "10000000",   // 0.1 BTC
      "maxAmount": "10000000000"     // 100 BTC
    }
  },
  "WBTC_WETH": {
    "tokenA": "WBTC",
    "tokenB": "WETH",
    "type": "major_pair",
    "priority": 7,
    "enabledChains": [42161, 137, 8453],
    "enabledDexes": ["uniswap_v3", "uniswap_v2", "sushiswap", "balancer_v2"],
    "tradingConfig": {
      "minSpread": 0.005,
      "maxSlippage": 0.01,
      "defaultAmount": "5000000",
      "maxAmount": "5000000000"
    }
  }
}
```

---

## ⛽ **GASSTRATEGIES.JSON CONFIGURATION**

### **Complete Gas Strategy Configuration**
```json
{
  "42161": {
    "chainName": "Arbitrum One",
    "strategy": "low_cost_optimized",
    "baseConfig": {
      "maxGasPrice": "${ARBITRUM_MAX_GAS_PRICE}",
      "baseFeeMultiplier": "${ARBITRUM_BASE_FEE_MULTIPLIER}",
      "priorityFeeMultiplier": "${ARBITRUM_PRIORITY_FEE_MULTIPLIER}",
      "gasLimitBuffer": 1.2
    },
    "dynamicConfig": {
      "enabled": true,
      "mempoolAnalysis": true,
      "competitiveBidding": true,
      "emergencyModes": {
        "congestion": {
          "threshold": "10000000000",
          "multiplier": 2.0,
          "maxMultiplier": 5.0
        },
        "competition": {
          "threshold": 3,
          "premium": "500000000"
        }
      }
    },
    "profitOptimization": {
      "maxGasPercentOfProfit": 0.8,
      "minProfitThreshold": "${ARBITRUM_MIN_PROFIT_USD}",
      "gasEfficiencyTarget": 0.15
    }
  },
  "137": {
    "chainName": "Polygon",
    "strategy": "balanced_performance",
    "baseConfig": {
      "maxGasPrice": "${POLYGON_MAX_GAS_PRICE}",
      "baseFeeMultiplier": "${POLYGON_BASE_FEE_MULTIPLIER}",
      "priorityFeeMultiplier": "${POLYGON_PRIORITY_FEE_MULTIPLIER}",
      "gasLimitBuffer": 1.3
    },
    "dynamicConfig": {
      "enabled": true,
      "mempoolAnalysis": true,
      "competitiveBidding": true,
      "emergencyModes": {
        "congestion": {
          "threshold": "100000000000",
          "multiplier": 3.0,
          "maxMultiplier": 10.0
        },
        "competition": {
          "threshold": 5,
          "premium": "5000000000"
        }
      }
    },
    "profitOptimization": {
      "maxGasPercentOfProfit": 0.7,
      "minProfitThreshold": "${POLYGON_MIN_PROFIT_USD}",
      "gasEfficiencyTarget": 0.25
    }
  },
  "8453": {
    "chainName": "Base",
    "strategy": "speed_optimized",
    "baseConfig": {
      "maxGasPrice": "${BASE_MAX_GAS_PRICE}",
      "baseFeeMultiplier": "${BASE_BASE_FEE_MULTIPLIER}",
      "priorityFeeMultiplier": "${BASE_PRIORITY_FEE_MULTIPLIER}",
      "gasLimitBuffer": 1.1
    },
    "dynamicConfig": {
      "enabled": true,
      "mempoolAnalysis": true,
      "competitiveBidding": true,
      "emergencyModes": {
        "congestion": {
          "threshold": "5000000000",
          "multiplier": 1.5,
          "maxMultiplier": 3.0
        },
        "competition": {
          "threshold": 2,
          "premium": "200000000"
        }
      }
    },
    "profitOptimization": {
      "maxGasPercentOfProfit": 0.8,
      "minProfitThreshold": "${BASE_MIN_PROFIT_USD}",
      "gasEfficiencyTarget": 0.1
    }
  }
}
```

---

## 🔧 **ENVIRONMENT VARIABLE TEMPLATE**

### **Complete .env Configuration**
```bash
# ================================
# CHAIN CONFIGURATION
# ================================

# Arbitrum Configuration
ARBITRUM_MAX_GAS_PRICE=5000000000
ARBITRUM_BASE_FEE_MULTIPLIER=1.1
ARBITRUM_PRIORITY_FEE_MULTIPLIER=1.2
ARBITRUM_MIN_PROFIT_USD=0.01
ARBITRUM_GAS_MULTIPLIER=6

# Polygon Configuration  
POLYGON_MAX_GAS_PRICE=50000000000
POLYGON_BASE_FEE_MULTIPLIER=1.2
POLYGON_PRIORITY_FEE_MULTIPLIER=1.3
POLYGON_MIN_PROFIT_USD=0.01
POLYGON_GAS_MULTIPLIER=8

# Base Configuration
BASE_MAX_GAS_PRICE=2000000000
BASE_BASE_FEE_MULTIPLIER=1.1
BASE_PRIORITY_FEE_MULTIPLIER=1.15
BASE_MIN_PROFIT_USD=0.01
BASE_GAS_MULTIPLIER=6

# ================================
# TOKEN ADDRESSES - ARBITRUM
# ================================
USDC_ARBITRUM=0xA0b86a33E6417c0c8b81B1Bd31d432c95593E351
USDT_ARBITRUM=0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9
DAI_ARBITRUM=0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1
WETH_ARBITRUM=0x82aF49447D8a07e3bd95BD0d56f35241523fBab1
WBTC_ARBITRUM=0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f
MATIC_ARBITRUM=0x561877b6b3DD7651313794e5F2894B2F18be0766
ARB_ARBITRUM=0x912CE59144191C1204E64559FE8253a0e49E6548

# ================================
# TOKEN ADDRESSES - POLYGON
# ================================
USDC_POLYGON=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
USDT_POLYGON=0xc2132D05D31c914a87C6611C10748AEb04B58e8F
DAI_POLYGON=0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063
WETH_POLYGON=0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619
WBTC_POLYGON=0x1BfD67037B42Cf73acF2047067bd4F2C47D9BfD6
WMATIC_POLYGON=0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270
MATIC_POLYGON=0x0000000000000000000000000000000000001010

# ================================
# TOKEN ADDRESSES - BASE
# ================================
USDC_BASE=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
USDT_BASE=0xfDE4C96c8593536E31F229EA73f37C80c89DA5ce
DAI_BASE=0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb
WETH_BASE=0x4200000000000000000000000000000000000006
WBTC_BASE=0xDfC25C0f3Bb9BcBf91C0000C76b1a8c2FecBE67C

# ================================
# DEX ADDRESSES - ARBITRUM
# ================================
UNISWAP_V3_FACTORY_ARBITRUM=0x1F98431c8aD98523631AE4a59f267346ea31F984
UNISWAP_V3_ROUTER_ARBITRUM=0xE592427A0AEce92De3Edee1F18E0157C05861564
UNISWAP_V2_FACTORY_ARBITRUM=0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9
UNISWAP_V2_ROUTER_ARBITRUM=0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
SUSHISWAP_FACTORY_ARBITRUM=0xc35DADB65012eC5796536bD9864eD8773aBc74C4
SUSHISWAP_ROUTER_ARBITRUM=0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506
BALANCER_V2_VAULT_ARBITRUM=0xBA12222222228d8Ba445958a75a0704d566BF2C8
CAMELOT_FACTORY_ARBITRUM=0x6EcCab422D763aC031210895C81787E87B0B678F
CAMELOT_ROUTER_ARBITRUM=0xc873fEcbd354f5A56E00E710B90EF4201db2448d

# ================================
# FLASH LOAN ADDRESSES
# ================================
AAVE_V3_POOL_ARBITRUM=0x794a61358D6845594F94dc1DB02A252b5b4814aD
AAVE_V3_POOL_POLYGON=0x794a61358D6845594F94dc1DB02A252b5b4814aD
AAVE_V3_POOL_BASE=0xA238Dd80C259a72e81d7e4664a9801593F98d1c5

# (Additional DEX and contract addresses for Polygon and Base...)
```

This configuration schema provides **complete templates** for all configuration files needed to build the enterprise MEV arbitrage bot with full scalability and maintainability.