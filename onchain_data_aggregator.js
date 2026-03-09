import fs from 'fs/promises';

// ============================================================================
// CONFIGURATION
// ============================================================================

// API key from environment variable - REQUIRED
const API_KEY = process.env.COINGECKO_API_KEY;

// Validate API key on startup
if (!API_KEY) {
  console.error('❌ COINGECKO_API_KEY environment variable is required');
  console.error('💡 Please set your CoinGecko API key as an environment variable');
  process.exit(1);
}

const BASE_URL = 'https://api.coingecko.com/api/v3';
const REQUEST_DELAY = 2100; // 2.1 seconds between requests (buffer for 30 calls/minute limit)
const MAX_RETRIES = 3;
const THROTTLE_WAIT_TIME = 65000; // 65 seconds wait when throttled (5s buffer)
const RATE_LIMIT_BUFFER = 100; // Extra 100ms buffer for network latency

// 🧪 TEST MODE - Set to true for testing with minimal API calls
const TEST_MODE = false; // TODO: Set to false for full processing
const TEST_MAX_DEXES = 3; // Only process first DEX in test mode
const TEST_MAX_POOLS_PER_DEX = 2; // Only process first pool per DEX in test mode

// ============================================================================
// TRADING SCORE CONFIGURATION
// ============================================================================

const SCORING_CONFIG = {
  // Liquidity thresholds (USD)
  LIQUIDITY_THRESHOLDS: {
    TIER_4: 10000000,  // $10M+
    TIER_3: 1000000,   // $1M+
    TIER_2: 100000,    // $100K+
    TIER_1: 10000      // $10K+
  },
  
  // Volume thresholds (USD)
  VOLUME_THRESHOLDS: {
    TIER_4: 10000000,  // $10M+
    TIER_3: 1000000,   // $1M+
    TIER_2: 100000,    // $100K+
    TIER_1: 10000      // $10K+
  },
  
  // Transaction thresholds (count)
  TRANSACTION_THRESHOLDS: {
    TIER_3: 1000,      // Very active
    TIER_2: 100,       // Active
    TIER_1: 10         // Some activity
  },
  
  // Pair scoring thresholds
  PAIR_LIQUIDITY_THRESHOLDS: {
    TIER_3: 50000000,  // $50M+
    TIER_2: 10000000,  // $10M+
    TIER_1: 1000000    // $1M+
  },
  
  PAIR_VOLUME_THRESHOLDS: {
    TIER_3: 10000000,  // $10M+
    TIER_2: 1000000,   // $1M+
    TIER_1: 100000     // $100K+
  },
  
  // Trade size limits
  MAX_TRADE_SIZE_USD: 1000000,  // $1M cap
  TRADE_SIZE_PERCENTAGE: 0.1,   // 10% of available liquidity
  
  // Processing limits
  MAX_PAGES_PER_DEX: 10,
  CHECKPOINT_FREQUENCY: 10
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse token address from relationship ID with validation
 */
const parseTokenAddress = (relationshipId) => {
  if (!relationshipId || typeof relationshipId !== 'string') {
    return null;
  }
  
  const parts = relationshipId.split('_');
  if (parts.length < 2) {
    return null;
  }
  
  const address = parts[1];
  // Basic validation for common address formats (Ethereum: 0x + 40 hex chars)
  if (!address || typeof address !== 'string') {
    return null;
  }
  
  // Accept various address formats (Ethereum, Solana, etc.)
  const isValidFormat = /^(0x[a-fA-F0-9]{40}|[A-Za-z0-9]{32,44})$/.test(address);
  
  return isValidFormat ? address : null;
};

/**
 * Safe float parsing with default
 */
const safeParseFloat = (value, defaultValue = 0) => {
  const parsed = parseFloat(value ?? defaultValue);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Parse pool attributes safely
 */
const parsePoolAttributes = (pool) => {
  const attrs = pool.attributes || {};
  return {
    reserveUSD: safeParseFloat(attrs.reserve_in_usd),
    volume24h: safeParseFloat(attrs.volume_usd?.h24),
    volume1h: safeParseFloat(attrs.volume_usd?.h1),
    transactions24h: (attrs.transactions?.h24?.buys || 0) + (attrs.transactions?.h24?.sells || 0),
    transactions1h: (attrs.transactions?.h1?.buys || 0) + (attrs.transactions?.h1?.sells || 0),
    lockedLiquidityPercentage: safeParseFloat(attrs.locked_liquidity_percentage),
    feePercentage: attrs.pool_fee_percentage || "0",
    baseTokenPriceUSD: attrs.base_token_price_usd || "0",
    quoteTokenPriceUSD: attrs.quote_token_price_usd || "0",
    baseTokenPriceQuoteToken: attrs.base_token_price_quote_token || "0",
    priceChangePercentage24h: attrs.price_change_percentage?.h24 || "0"
  };
};

/**
 * Generic scoring utility based on thresholds
 */
const calculateThresholdScore = (value, thresholds) => {
  if (thresholds.TIER_4 && value > thresholds.TIER_4) return 4;
  if (value > thresholds.TIER_3) return 3;
  if (value > thresholds.TIER_2) return 2;
  if (value > thresholds.TIER_1) return 1;
  return 0;
};

// ============================================================================
// CHECKPOINT FUNCTIONS
// ============================================================================

/**
 * Save checkpoint of current progress with granular details
 * @param {string} step - Current processing step identifier
 * @param {Object} data - Current data state to save
 * @param {Object} [metadata={}] - Additional metadata for checkpoint
 * @returns {Promise<void>}
 */
const saveCheckpoint = async (step, data, metadata = {}) => {
  const checkpoint = {
    step,
    data,
    // Granular tracking for pools step
    ...(step === 'pools' && {
      currentDexPosition: metadata.currentDexPosition || 0,
      currentDexId: metadata.currentDexId || null,
      currentPage: metadata.currentPage || 1,
      totalDexes: metadata.totalDexes || 0,
      totalPools: metadata.totalPools || 0,
      totalTokens: metadata.totalTokens || 0
    }),
    // Granular tracking for complete_pools step
    ...(step === 'complete_pools' && {
      currentPoolIndex: metadata.currentPoolIndex || 0,
      totalPools: metadata.totalPools || 0
    }),
    tokenLookup: metadata.tokenLookup || null,
    assetPlatformLookup: metadata.assetPlatformLookup || null,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString(),
      apiKey: API_KEY ? 'SET' : 'NOT_SET'
    }
  };
  
  await fs.writeFile('onchain_aggregator_checkpoint.json', JSON.stringify(checkpoint, null, 2));
  
  if (step === 'pools' && metadata.currentDexId) {
    console.log(`💾 Checkpoint saved: DEX ${metadata.currentDexPosition + 1}/${metadata.totalDexes}, Page ${metadata.currentPage}`);
  } else if (step === 'complete_pools' && metadata.currentPoolIndex !== undefined) {
    console.log(`💾 Checkpoint saved: Pool ${metadata.currentPoolIndex + 1}/${metadata.totalPools}`);
  } else {
    console.log(`💾 Checkpoint saved: Step ${step} completed`);
  }
};

/**
 * Load checkpoint if it exists
 */
const loadCheckpoint = async () => {
  try {
    const fileContent = await fs.readFile('onchain_aggregator_checkpoint.json', 'utf8');
    const checkpoint = JSON.parse(fileContent);
    
    // Validate checkpoint structure
    if (!checkpoint.step || !checkpoint.data || !checkpoint.metadata) {
      console.log('⚠️  Invalid checkpoint structure, starting fresh');
      return null;
    }
    
    // Validate required fields based on step
    const validSteps = ['chain_lookup', 'dexes', 'pools', 'complete_pools'];
    if (!validSteps.includes(checkpoint.step)) {
      console.log(`⚠️  Unknown checkpoint step "${checkpoint.step}", starting fresh`);
      return null;
    }
    
    console.log(`📂 Checkpoint found: Last completed step was "${checkpoint.step}"`);
    console.log(`📅 Last checkpoint: ${checkpoint.metadata.timestamp}`);
    return checkpoint;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('📂 No checkpoint found, starting fresh');
    } else {
      console.log(`⚠️  Error loading checkpoint: ${error.message}, starting fresh`);
    }
    return null;
  }
};

/**
 * Clean up checkpoint file after successful completion
 */
const cleanupCheckpoint = async () => {
  try {
    await fs.unlink('onchain_aggregator_checkpoint.json');
    console.log('🧹 Checkpoint file cleaned up');
  } catch (error) {
    // File doesn't exist, which is fine
  }
};

// ============================================================================
// API REQUEST FUNCTIONS
// ============================================================================

/**
 * Make API request with throttling protection and retries
 * @param {string} endpoint - API endpoint path (e.g., '/onchain/networks')
 * @param {string} description - Human-readable description for logging
 * @returns {Promise<Object>} JSON response from API
 * @throws {Error} When request fails after all retries
 */
const makeRequest = async (endpoint, description = '') => {
  const url = `${BASE_URL}${endpoint}`;
  
  // Create abort controller for timeout with race condition protection
  const controller = new AbortController();
  let timeoutFired = false;
  const timeoutId = setTimeout(() => {
    timeoutFired = true;
    controller.abort();
  }, 30000); // 30 second timeout
  
  const options = {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'x-cg-demo-api-key': API_KEY
    },
    signal: controller.signal
  };

  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`🔍 ${description} (attempt ${attempt}/${MAX_RETRIES})`);
        console.log(`   URL: ${url}`);

        const response = await fetch(url, options);
        
        // Check for throttling first (before parsing)
        if (response.status === 429) {
          console.log(`⏳ Throttled! Waiting ${THROTTLE_WAIT_TIME / 1000} seconds before retry...`);
          await sleep(THROTTLE_WAIT_TIME);
          continue;
        }

        if (response.status !== 200) {
          const responseText = await response.text();
          console.log(`❌ HTTP ${response.status} for ${description}`);
          if (attempt < MAX_RETRIES) {
            await sleep(2000);
            continue;
          } else {
            // After max retries, throw error to stop entire script
            throw new Error(`HTTP ${response.status}: ${responseText}`);
          }
        }

        // Parse JSON only for successful responses
        const json = await response.json();
        
        // Additional throttling check in response body (safer than stringifying)
        if (json && typeof json === 'object') {
          const hasThrottleMessage = JSON.stringify(json).includes('Throttled') || 
                                   JSON.stringify(json).includes('Rate limit') ||
                                   (json.error && typeof json.error === 'string' && 
                                    (json.error.includes('Throttled') || json.error.includes('Rate limit')));
          
          if (hasThrottleMessage) {
            console.log(`⏳ Throttled! Waiting ${THROTTLE_WAIT_TIME / 1000} seconds before retry...`);
            await sleep(THROTTLE_WAIT_TIME);
            continue;
          }
        }
        console.log(`  ✅ ${description} - Success`);

        // Rate limiting delay with buffer (except for last request in a series)
        await sleep(REQUEST_DELAY + RATE_LIMIT_BUFFER);

        return json;

      } catch (error) {
        console.error(`💥 Error in ${description}: ${error.message}`);
        
        // Handle timeout errors consistently
        if (error.name === 'AbortError') {
          if (timeoutFired) {
            console.log(`⏰ Request timeout after 30 seconds for ${description}`);
            if (attempt < MAX_RETRIES) {
              console.log(`🔄 Retrying timeout in 5 seconds... (${attempt}/${MAX_RETRIES})`);
              await sleep(5000);
              continue;
            } else {
              throw new Error(`Request timeout for ${description} after ${MAX_RETRIES} attempts`);
            }
          } else {
            // Abort was called for other reasons, treat as regular error
            console.log(`🛑 Request aborted for ${description}: ${error.message}`);
            if (attempt < MAX_RETRIES) {
              await sleep(2000);
              continue;
            } else {
              throw new Error(`Request aborted for ${description} after ${MAX_RETRIES} attempts`);
            }
          }
        }
        
        // Handle throttling and JSON parsing errors consistently
        if (error.message.includes('Throttled') || error.message.includes('JSON') || error.message.includes('rate limit')) {
          console.log(`⏳ Detected throttling/parsing error for ${description}, waiting ${THROTTLE_WAIT_TIME / 1000} seconds...`);
          await sleep(THROTTLE_WAIT_TIME);
          continue;
        } else if (attempt < MAX_RETRIES) {
          console.log(`🔄 Retrying ${description} in 2 seconds... (${attempt}/${MAX_RETRIES})`);
          await sleep(2000);
        } else {
          // After max retries, throw detailed error with context
          throw new Error(`Failed ${description} after ${MAX_RETRIES} attempts. URL: ${url}, Last error: ${error.message}, Status: ${response?.status || 'N/A'}`);
        }
      }
    }
  } finally {
    // Always clear timeout regardless of success or failure
    clearTimeout(timeoutId);
  }
};

// ============================================================================
// CORE AGGREGATION FUNCTIONS
// ============================================================================

/**
 * Step 1: Load chain data from the chains reference file
 */
const loadChainReference = async (targetChain) => {
  console.log(`\n🔍 Step 1: Looking up chain data for: ${targetChain}`);
  
  try {
    // Try to read the chains reference file
    const chainsContent = await fs.readFile('chains_reference.json', 'utf8');
    const chainsReference = JSON.parse(chainsContent);
    
    if (!targetChain) {
      console.log(`✅ Loaded ${Object.keys(chainsReference).length} chains from reference`);
      return { chainsReference, targetChain: null };
    }
    
    const targetLower = targetChain.toLowerCase();
    
    // First, try exact ID match (highest priority)
    let chain = chainsReference[targetLower];
    
    if (chain) {
      console.log(`🎯 Target chain found (exact ID match): ${chain.name} (ID: ${chain.id})`);
      if (chain.chain_identifier) {
        console.log(`   ✨ Chain identifier: ${chain.chain_identifier}`);
      }
      return { chainsReference, targetChain: chain };
    }
    
    // Second, try exact name match
    chain = Object.values(chainsReference).find(c => c.name.toLowerCase() === targetLower);
    
    if (chain) {
      console.log(`🎯 Target chain found (exact name match): ${chain.name} (ID: ${chain.id})`);
      if (chain.chain_identifier) {
        console.log(`   ✨ Chain identifier: ${chain.chain_identifier}`);
      }
      return { chainsReference, targetChain: chain };
    }
    
    // Third, try partial matches
    const partialMatches = Object.values(chainsReference).filter(c => 
      c.id.toLowerCase().includes(targetLower) || 
      c.name.toLowerCase().includes(targetLower)
    );
    
    if (partialMatches.length === 1) {
      chain = partialMatches[0];
      console.log(`🎯 Target chain found (partial match): ${chain.name} (ID: ${chain.id})`);
      if (chain.chain_identifier) {
        console.log(`   ✨ Chain identifier: ${chain.chain_identifier}`);
      }
      return { chainsReference, targetChain: chain };
    } else if (partialMatches.length > 1) {
      console.log(`❌ Multiple chains match "${targetChain}":`);
      partialMatches.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.name} (ID: ${c.id})`);
      });
      throw new Error(`Multiple chains match "${targetChain}". Please be more specific.`);
    } else {
      console.log(`❌ Target chain "${targetChain}" not found`);
      const availableChains = Object.values(chainsReference).filter(c => c.hasNetwork);
      console.log('Available chains with DEX networks:');
      availableChains.slice(0, 10).forEach(c => console.log(`  - ${c.name} (ID: ${c.id})`));
      if (availableChains.length > 10) {
        console.log(`  ... and ${availableChains.length - 10} more`);
      }
      throw new Error(`Chain "${targetChain}" not found`);
    }
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('❌ Chains reference file not found!');
      console.log('💡 Run this command to create it:');
      console.log('   node onchain_data_aggregator.js --refresh-cache');
      throw new Error('Chains reference file not found. Run --refresh-cache first.');
    }
    throw error;
  }
};

/**
 * Step 2: Get all DEXes for the target chain
 */
const getDexes = async (chainId) => {
  console.log(`\n🏦 Step 2: Fetching DEXes for chain "${chainId}"...`);
  
  const response = await makeRequest(`/onchain/networks/${chainId}/dexes`, `Fetching DEXes for ${chainId}`);
  const dexes = response.data || [];
  
  console.log(`✅ Found ${dexes.length} DEXes on ${chainId}`);  
  return dexes;
};

/**
 * Step 3: Get all pools for each DEX with token data included (with pagination support and page limits)
 * @param {Object} config - Configuration object
 * @param {string} config.chainId - Blockchain network ID
 * @param {string} config.dexId - DEX identifier
 * @param {string} config.dexName - DEX display name
 * @param {Map} config.tokenLookup - Token address to metadata lookup map
 * @param {number} [config.startPage=1] - Starting page for pagination
 * @returns {Promise<{pools: Array, tokensAdded: number}>} Pools data and token count
 */
const getPoolsForDex = async (config) => {
  const { chainId, dexId, dexName, tokenLookup, startPage = 1 } = config;
  console.log(`\n💰 Step 3: Fetching pools for ${dexName} (${dexId}) with token data...`);
  
  if (TEST_MODE) {
    console.log(`🧪 TEST MODE: Limited to ${TEST_MAX_POOLS_PER_DEX} pool(s) per DEX`);
  }
  
  let allPools = [];
  let page = startPage;
  let hasMorePages = true;
  let tokensAdded = 0;
  
  while (hasMorePages && page <= SCORING_CONFIG.MAX_PAGES_PER_DEX) {
    try {
      const endpoint = `/onchain/networks/${chainId}/dexes/${dexId}/pools?page=${page}&include=base_token,quote_token`;
      const response = await makeRequest(endpoint, `Fetching ${dexName} pools (page ${page})`);
      const pools = response.data || [];
      const includedTokens = response.included || [];
      
      if (pools.length === 0) {
        hasMorePages = false;
      } else {
        // In test mode, limit pools per DEX
        const poolsToAdd = TEST_MODE ? pools.slice(0, TEST_MAX_POOLS_PER_DEX) : pools;
        allPools.push(...poolsToAdd);
        
        // Process included tokens and add to lookup if new
        for (const item of includedTokens) {
          if (item.type === 'token') {
            const address = item.attributes.address;
            if (!tokenLookup.has(address)) {
              tokenLookup.set(address, {
                id: item.id,
                address: item.attributes.address,
                name: item.attributes.name,
                symbol: item.attributes.symbol,
                decimals: item.attributes.decimals,
                image_url: item.attributes.image_url,
                coingecko_coin_id: item.attributes.coingecko_coin_id,
                poolCount: 0  // Initialize pool count
              });
              tokensAdded++;
            }
          }
        }
        
        // Note: Pool counts will be recalculated accurately after all data is loaded
        // to avoid double-counting issues when resuming from checkpoints
        
        console.log(`  📄 Page ${page}: ${poolsToAdd.length} pools${TEST_MODE ? ' (LIMITED)' : ''}, ${includedTokens.filter(i => i.type === 'token').length} tokens (${tokensAdded} new) (Total pools: ${allPools.length})`);
        
        // In test mode, stop after getting the limited pools
        if (TEST_MODE && allPools.length >= TEST_MAX_POOLS_PER_DEX) {
          hasMorePages = false;
          console.log(`  🧪 TEST MODE: Reached pool limit (${TEST_MAX_POOLS_PER_DEX}), stopping`);
        } else {
          page++;
          
          // Check if there's a next page in the response metadata
          if (response.meta && response.meta.page && response.meta.page.next === null) {
            hasMorePages = false;
          }
          
          // Hard stop at page limit to avoid 401 errors
          if (page > SCORING_CONFIG.MAX_PAGES_PER_DEX) {
            console.log(`  ⚠️  Reached CoinGecko free tier page limit (${SCORING_CONFIG.MAX_PAGES_PER_DEX}), stopping`);
            hasMorePages = false;
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ Error fetching page ${page} for ${dexName}: ${error.message}`);
      // Fail fast - throw error to stop entire script
      throw new Error(`Failed to fetch page ${page} for ${dexName}: ${error.message}`);
    }
  }
  
  console.log(`✅ Total pools for ${dexName}: ${allPools.length}${TEST_MODE ? ' (TEST MODE)' : ''}`);
  console.log(`✅ Tokens added from ${dexName}: ${tokensAdded}`);
  return { pools: allPools, tokensAdded };
};

/**
 * Step 4: Get complete pool details for fee percentage and locked liquidity (with granular checkpointing)
 * @param {Object} config - Configuration object
 * @param {string} config.chainId - Blockchain network ID
 * @param {Array} config.pools - Array of pool objects to complete
 * @param {number} [config.startPoolIndex=0] - Starting pool index for resumption
 * @param {Function} [config.onCheckpoint] - Callback function to save checkpoints during processing
 * @returns {Promise<Array>} Array of pools with complete data
 */
const getCompletePoolData = async (config) => {
  const { chainId, pools, startPoolIndex = 0, onCheckpoint } = config;
  console.log(`\n🏊 Step 4: Fetching complete pool details for ${pools.length} pools...`);
  
  if (startPoolIndex > 0) {
    console.log(`📍 Resuming from pool ${startPoolIndex + 1}/${pools.length}`);
  }
  
  const completePoolData = [];
  
  // Add already processed pools (from checkpoint)
  for (let i = 0; i < startPoolIndex; i++) {
    completePoolData.push(pools[i]);
  }
  
  for (let i = startPoolIndex; i < pools.length; i++) {
    const pool = pools[i];
    const poolAddress = pool.attributes.address;
    
    try {
      const endpoint = `/onchain/networks/${chainId}/pools/${poolAddress}`;
      const response = await makeRequest(
        endpoint, 
        `Fetching complete data for pool ${i + 1}/${pools.length} (${poolAddress.slice(0, 8)}...)`
      );
      
      if (response.data) {
        // Merge the basic pool data with the complete pool data
        const completePool = {
          ...pool,
          attributes: {
            ...pool.attributes,
            pool_fee_percentage: response.data.attributes.pool_fee_percentage,
            locked_liquidity_percentage: response.data.attributes.locked_liquidity_percentage
          }
        };
        completePoolData.push(completePool);
      } else {
        // Keep original pool data if complete data fetch fails
        console.log(`  ⚠️  No complete data for ${poolAddress.slice(0, 8)}..., keeping basic data`);
        completePoolData.push(pool);
      }
      
      // Save checkpoint every N pools to avoid losing progress
      if ((i + 1) % SCORING_CONFIG.CHECKPOINT_FREQUENCY === 0 || i === pools.length - 1) {
        console.log(`  💾 Progress: ${i + 1}/${pools.length} pools completed`);
        
        // Save checkpoint with current pool index
        if (onCheckpoint) {
          await onCheckpoint(i);
        }
      }
      
    } catch (error) {
      console.error(`  ❌ Error fetching complete data for ${poolAddress.slice(0, 8)}...: ${error.message}`);
      // Fail fast - throw error to stop entire script
      throw new Error(`Failed to fetch complete pool data at pool ${i + 1}/${pools.length}: ${error.message}`);
    }
  }
  
  console.log(`✅ Complete pool data fetching finished: ${completePoolData.length}/${pools.length} pools processed`);
  return completePoolData;
};

/**
 * Recalculate accurate pool counts for all tokens to fix double-counting issues
 * @param {Object} chainData - Chain data with DEXes and pools
 * @param {Map} tokenLookup - Token lookup map to update
 */
const recalculatePoolCounts = (chainData, tokenLookup) => {
  // Reset all pool counts to 0
  for (const [address, token] of tokenLookup) {
    token.poolCount = 0;
  }
  
  // Count pools accurately by iterating through all pools
  let totalPoolsCounted = 0;
  for (const dex of chainData.dexes) {
    for (const pool of dex.pools) {
      const baseTokenAddress = parseTokenAddress(pool.relationships?.base_token?.data?.id);
      const quoteTokenAddress = parseTokenAddress(pool.relationships?.quote_token?.data?.id);
      
      // Increment count for base token
      if (baseTokenAddress && tokenLookup.has(baseTokenAddress)) {
        tokenLookup.get(baseTokenAddress).poolCount++;
      }
      
      // Increment count for quote token
      if (quoteTokenAddress && tokenLookup.has(quoteTokenAddress)) {
        tokenLookup.get(quoteTokenAddress).poolCount++;
      }
      
      totalPoolsCounted++;
    }
  }
  
  const tokensWithPools = Array.from(tokenLookup.values()).filter(t => t.poolCount > 0).length;
  console.log(`✅ Pool counts recalculated: ${totalPoolsCounted} pools processed, ${tokensWithPools} tokens have pools`);
};

// ============================================================================
// MAIN ORCHESTRATION FUNCTION
// ============================================================================

/**
 * Main function to aggregate all onchain data for a given chain
 */
const aggregateChainData = async (targetChain) => {
  console.log(`🚀 Starting onchain data aggregation for: ${targetChain}\n`);
  
  try {
    // Check for existing checkpoint
    const checkpoint = await loadCheckpoint();
    let chainData = {};
    let tokenLookup = new Map(); // Initialize token lookup
    
    if (checkpoint && checkpoint.step === 'chain_lookup') {
      console.log('📂 Resuming from chain_lookup step...');
      chainData = checkpoint.data;
    } else {
      // Step 1: Load chain data from cache 
      const { chainsReference, targetChain: chain } = await loadChainReference(targetChain);
      

      chainData.chainInfo = chain;
      chainData.chainsReference = chainsReference;
      chainData.dexes = [];
      await saveCheckpoint('chain_lookup', chainData, { chainId: chain.id });
    }
    
    if (checkpoint && checkpoint.step === 'dexes') {
      console.log('📂 Resuming from dexes step...');
      chainData = checkpoint.data;
    } else {
      // Step 2: Get DEXes
      const dexes = await getDexes(chainData.chainInfo.id);
      
      // In test mode, limit to first DEX only
      const dexesToProcess = TEST_MODE ? dexes.slice(0, TEST_MAX_DEXES) : dexes;
      
      if (TEST_MODE) {
        console.log(`🧪 TEST MODE: Processing only ${dexesToProcess.length} of ${dexes.length} DEXes`);
        dexesToProcess.forEach(dex => console.log(`  - ${dex.attributes.name} (${dex.id})`));
      }
      
      chainData.dexes = dexesToProcess.map(dex => ({
        id: dex.id,
        name: dex.attributes.name,
        pools: []
      }));
      await saveCheckpoint('dexes', chainData, { dexCount: dexesToProcess.length, testMode: TEST_MODE });
    }
    
    if (checkpoint && checkpoint.step === 'pools') {
      console.log('📂 Resuming from pools step...');
      chainData = checkpoint.data;
      // Restore tokenLookup from checkpoint if available
      if (checkpoint.tokenLookup && typeof checkpoint.tokenLookup === 'object') {
        try {
          tokenLookup = new Map(Object.entries(checkpoint.tokenLookup));
          console.log(`📦 Restored ${tokenLookup.size} tokens from checkpoint`);
        } catch (error) {
          console.log(`⚠️  Error restoring tokenLookup: ${error.message}, starting with empty lookup`);
          tokenLookup = new Map();
        }
      }
      console.log(`📍 Resuming from DEX ${checkpoint.currentDexPosition + 1}/${checkpoint.totalDexes} at page ${checkpoint.currentPage}`);
    } else {
      // Step 3: Get pools for each DEX with token data - with granular checkpointing
      let totalPools = 0;
      let totalTokens = 0;
      
      // Determine starting position from checkpoint
      const startDexPosition = (checkpoint && checkpoint.step === 'pools') ? checkpoint.currentDexPosition : 0;
      const startPage = (checkpoint && checkpoint.step === 'pools') ? checkpoint.currentPage + 1 : 1;
      
      for (let dexIndex = startDexPosition; dexIndex < chainData.dexes.length; dexIndex++) {
        const dex = chainData.dexes[dexIndex];
        const currentPage = (dexIndex === startDexPosition) ? startPage : 1;
        
        try {
          console.log(`\n🏦 Processing DEX ${dexIndex + 1}/${chainData.dexes.length}: ${dex.name}`);
          
          const { pools, tokensAdded } = await getPoolsForDex({
            chainId: chainData.chainInfo.id, 
            dexId: dex.id, 
            dexName: dex.name, 
            tokenLookup, 
            startPage: currentPage
          });
          
          chainData.dexes[dexIndex].pools = pools;
          totalPools += pools.length;
          totalTokens += tokensAdded;
          
          // Save granular checkpoint after each DEX
          await saveCheckpoint('pools', chainData, {
            currentDexPosition: dexIndex,
            currentDexId: dex.id,
            currentPage: 1, // Reset for next DEX
            totalDexes: chainData.dexes.length,
            totalPools,
            totalTokens,
            tokenLookup: Object.fromEntries(tokenLookup)
          });
          
        } catch (error) {
          console.error(`❌ Failed to fetch pools for ${dex.name}: ${error.message}`);
          // Fail fast - stop entire script on any DEX failure
          throw new Error(`Pool fetching failed at DEX ${dexIndex + 1}/${chainData.dexes.length} (${dex.name}): ${error.message}`);
        }
      }
      
      console.log(`\n✅ All DEXes processed successfully!`);
      console.log(`📊 Final totals: ${totalPools} pools, ${totalTokens} tokens added`);
    }
    
    // Step 4: Get complete pool data for fee percentage and locked liquidity
    console.log(`\n📊 Current token lookup size: ${tokenLookup.size} unique tokens`);
    
    let allPools = [];
    for (const dex of chainData.dexes) {
      allPools.push(...dex.pools);
    }
    
    // Check for complete_pools checkpoint
    const startPoolIndex = (checkpoint && checkpoint.step === 'complete_pools') ? checkpoint.currentPoolIndex + 1 : 0;
    
    if (checkpoint && checkpoint.step === 'complete_pools') {
      console.log(`📂 Resuming complete pool data from pool ${startPoolIndex + 1}/${allPools.length}`);
    }
    
    const completePoolData = await getCompletePoolData({
      chainId: chainData.chainInfo.id, 
      pools: allPools, 
      startPoolIndex,
      onCheckpoint: async (currentPoolIndex) => {
        await saveCheckpoint('complete_pools', chainData, {
          currentPoolIndex,
          totalPools: allPools.length
        });
      }
    });
    
    // Update chainData with complete pool data
    let poolIndex = 0;
    for (let i = 0; i < chainData.dexes.length; i++) {
      const dex = chainData.dexes[i];
      const updatedPools = completePoolData.slice(poolIndex, poolIndex + dex.pools.length);
      chainData.dexes[i].pools = updatedPools;
      poolIndex += dex.pools.length;
    }
    
    // Recalculate accurate pool counts to fix double-counting issues
    console.log('\n🔢 Recalculating accurate pool counts...');
    recalculatePoolCounts(chainData, tokenLookup);
    
    // Create final data structure
    const finalData = createFinalDataStructure(chainData, tokenLookup);
    
    // Save results
    await saveFinalResults(finalData, targetChain);
    await cleanupCheckpoint();
    
    console.log('\n🎉 Onchain data aggregation completed successfully!');
    return finalData;
    
  } catch (error) {
    console.error('❌ Error during aggregation process:', error.message);
    console.log('💾 Progress saved in checkpoint file. Run again to resume from where you left off.');
    throw error;
  }
};

// ============================================================================
// DATA STRUCTURE FUNCTIONS
// ============================================================================

/**
 * Initialize the base data structure
 */
const initializeDataStructure = (chainData, tokenLookup) => {
  // Optimized Map to Object conversion using Object.fromEntries
  const tokenLookupObj = Object.fromEntries(tokenLookup);

  return {
    metadata: {
      chain: {
        id: chainData.chainInfo.id,
        name: chainData.chainInfo.name,
        chain_id: chainData.chainInfo.chain_identifier,
        native_token: chainData.chainInfo.native_coin_id?.toUpperCase() || 'ETH'
      },
      dataTimestamp: new Date().toISOString(),
      totalDexes: chainData.dexes.length,
      totalPools: 0,
      totalTradingPairs: 0
    },
    dexes: {},
    tokens: tokenLookupObj,
    pools: {},
    tradingPairs: {},
    rankings: {
      topPoolsByVolume: [],
      topPoolsByLiquidity: [],
      topTradingPairs: []
    }
  };
};

/**
 * Process DEXes and pools into the final structure
 */
const processPoolsAndPairs = (chainData, finalData) => {
  const allPools = [];
  const pairGroups = new Map();

  for (const dex of chainData.dexes) {
    // Add DEX info
    finalData.dexes[dex.id] = {
      id: dex.id,
      name: dex.name,
      type: getDexType(dex.name),
      poolCount: dex.pools.length,
      totalLiquidity: calculateDexLiquidity(dex.pools)
    };

    // Process each pool
    for (const pool of dex.pools) {
      const baseTokenAddress = parseTokenAddress(pool.relationships?.base_token?.data?.id);
      const quoteTokenAddress = parseTokenAddress(pool.relationships?.quote_token?.data?.id);
      
      if (!baseTokenAddress || !quoteTokenAddress) continue;
      
      const baseToken = finalData.tokens[baseTokenAddress];
      const quoteToken = finalData.tokens[quoteTokenAddress];
      
      if (!baseToken || !quoteToken) continue;

      // Parse pool attributes once
      const parsedAttrs = parsePoolAttributes(pool);
      const availableLiquidityUSD = parsedAttrs.reserveUSD * (1 - parsedAttrs.lockedLiquidityPercentage / 100);
      
      // Create pair key for grouping (always alphabetical order)
      const pairKey = createPairKey(baseToken.symbol, quoteToken.symbol);
      
      // Create rich pool object
      const poolData = {
        address: pool.attributes.address,
        name: pool.attributes.name,
        dexId: dex.id,
        baseToken: baseTokenAddress,
        quoteToken: quoteTokenAddress,
        pairKey,
        economics: {
          feePercentage: parsedAttrs.feePercentage,
          reserveUSD: parsedAttrs.reserveUSD.toString(),
          lockedLiquidityPercentage: parsedAttrs.lockedLiquidityPercentage.toString(),
          availableLiquidityUSD: availableLiquidityUSD.toString()
        },
        pricing: {
          baseTokenPriceUSD: parsedAttrs.baseTokenPriceUSD,
          quoteTokenPriceUSD: parsedAttrs.quoteTokenPriceUSD,
          baseTokenPriceQuoteToken: parsedAttrs.baseTokenPriceQuoteToken,
          priceChangePercentage24h: parsedAttrs.priceChangePercentage24h
        },
        activity: {
          volumeUSD24h: parsedAttrs.volume24h.toString(),
          volumeUSD1h: parsedAttrs.volume1h.toString(),
          transactions24h: {
            buys: pool.attributes.transactions?.h24?.buys || 0,
            sells: pool.attributes.transactions?.h24?.sells || 0,
            total: parsedAttrs.transactions24h
          },
          transactions1h: {
            buys: pool.attributes.transactions?.h1?.buys || 0,
            sells: pool.attributes.transactions?.h1?.sells || 0,
            total: parsedAttrs.transactions1h
          }
        },
        tradingMetrics: calculateTradingMetrics(parsedAttrs, availableLiquidityUSD)
      };
      
      // Add to pools
      finalData.pools[pool.attributes.address] = poolData;
      allPools.push(poolData);
      
      // Group by pair for trading opportunities
      if (!pairGroups.has(pairKey)) {
        pairGroups.set(pairKey, {
          baseToken: baseTokenAddress,
          quoteToken: quoteTokenAddress,
          availableDexes: [],
          pools: [],
          totalLiquidity: 0,
          totalVolume24h: 0
        });
      }
      
      const pairGroup = pairGroups.get(pairKey);
      if (!pairGroup.availableDexes.includes(dex.id)) {
        pairGroup.availableDexes.push(dex.id);
      }
      pairGroup.pools.push(pool.attributes.address);
      pairGroup.totalLiquidity += parsedAttrs.reserveUSD;
      pairGroup.totalVolume24h += parsedAttrs.volume24h;
    }
  }

  return { allPools, pairGroups };
};

/**
 * Create trading pairs from pair groups
 */
const createTradingPairs = (finalData, pairGroups) => {
  for (const [pairKey, pairData] of pairGroups) {
    if (pairData.availableDexes.length > 1) {
      finalData.tradingPairs[pairKey] = {
        baseToken: pairData.baseToken,
        quoteToken: pairData.quoteToken,
        availableDexes: pairData.availableDexes,
        pools: pairData.pools,
        totalLiquidity: pairData.totalLiquidity.toString(),
        totalVolume24h: pairData.totalVolume24h.toString(),
        tradingScore: calculatePairTradingScore(pairData),
        opportunityFrequency: getOpportunityFrequency(pairData.totalVolume24h)
      };
    }
  }
};

/**
 * Update competitor pool counts
 */
const updateCompetitorCounts = (finalData, pairGroups) => {
  for (const [pairKey, pairData] of pairGroups) {
    for (const poolAddress of pairData.pools) {
      if (finalData.pools[poolAddress]) {
        finalData.pools[poolAddress].tradingMetrics.competitorPools = pairData.pools.length - 1;
      }
    }
  }
};

/**
 * Generate rankings
 */
const generateRankings = (finalData, allPools) => {
  finalData.rankings.topPoolsByVolume = allPools
    .sort((a, b) => safeParseFloat(b.activity.volumeUSD24h) - safeParseFloat(a.activity.volumeUSD24h))
    .slice(0, 10)
    .map(p => p.address);
    
  finalData.rankings.topPoolsByLiquidity = allPools
    .sort((a, b) => safeParseFloat(b.economics.reserveUSD) - safeParseFloat(a.economics.reserveUSD))
    .slice(0, 10)
    .map(p => p.address);
    
  finalData.rankings.topTradingPairs = Object.entries(finalData.tradingPairs)
    .sort(([,a], [,b]) => b.tradingScore - a.tradingScore)
    .slice(0, 10)
    .map(([pairKey]) => pairKey);
};

/**
 * Create the final optimized data structure for trading bot
 */
const createFinalDataStructure = (chainData, tokenLookup) => {
  console.log('\n📊 Creating final trading-optimized data structure...');
  
  const finalData = initializeDataStructure(chainData, tokenLookup);
  const { allPools, pairGroups } = processPoolsAndPairs(chainData, finalData);
  
  createTradingPairs(finalData, pairGroups);
  updateCompetitorCounts(finalData, pairGroups);
  
  // Update metadata
  finalData.metadata.totalPools = allPools.length;
  finalData.metadata.totalTradingPairs = Object.keys(finalData.tradingPairs).length;
  
  generateRankings(finalData, allPools);
  
  console.log(`✅ Trading-optimized structure created:`);
  console.log(`   - Chain: ${finalData.metadata.chain.name} (${finalData.metadata.chain.id})`);
  console.log(`   - DEXes: ${finalData.metadata.totalDexes}`);
  console.log(`   - Pools: ${finalData.metadata.totalPools}`);
  console.log(`   - Trading Pairs: ${finalData.metadata.totalTradingPairs}`);
  console.log(`   - Unique Tokens: ${Object.keys(finalData.tokens).length}`);
  
  return finalData;
};

// Helper functions for the new structure
const getDexType = (dexName) => {
  const name = dexName.toLowerCase();
  if (name.includes('v3') || name.includes('v4')) return 'concentrated_liquidity';
  if (name.includes('curve')) return 'stable_swap';
  return 'constant_product';
};

const calculateDexLiquidity = (pools) => {
  return pools.reduce((sum, pool) => {
    return sum + parseFloat(pool.attributes.reserve_in_usd || 0);
  }, 0).toString();
};

const createPairKey = (symbol1, symbol2) => {
  // Always alphabetical order for consistent grouping
  return [symbol1, symbol2].sort().join('/');
};

/**
 * Calculate trading quality metrics for a pool
 * Components:
 * - Liquidity depth (higher = larger trade capacity)  
 * - Trading volume (higher = more active market)
 * - Transaction frequency (higher = more liquid market)
 * NOTE: Does NOT include price spreads - calculated real-time by MEV bot
 * @param {Object} parsedAttrs - Parsed pool attributes
 * @param {number} availableLiquidityUSD - Available liquidity in USD
 * @returns {Object} Trading metrics including score, maxTradeSize, etc.
 */
const calculateTradingMetrics = (parsedAttrs, availableLiquidityUSD) => {
  // Calculate component scores using configuration
  const liquidityScore = calculateThresholdScore(availableLiquidityUSD, SCORING_CONFIG.LIQUIDITY_THRESHOLDS);
  const volumeScore = calculateThresholdScore(parsedAttrs.volume24h, SCORING_CONFIG.VOLUME_THRESHOLDS);
  const activityScore = calculateThresholdScore(parsedAttrs.transactions24h, SCORING_CONFIG.TRANSACTION_THRESHOLDS);
  
  const totalScore = liquidityScore + volumeScore + activityScore;
  
  return {
    score: Math.round(totalScore * 10) / 10,
    rank: 0, // Will be calculated later in rankings
    maxTradeSize: Math.min(
      availableLiquidityUSD * SCORING_CONFIG.TRADE_SIZE_PERCENTAGE, 
      SCORING_CONFIG.MAX_TRADE_SIZE_USD
    ).toString(),
    competitorPools: 0 // Will be calculated when processing trading pairs
  };
};

const calculatePairTradingScore = (pairData) => {
  let score = 0;
  
  // More DEXes = better trading opportunities (2 points per DEX)
  score += pairData.availableDexes.length * 2;
  
  // Add liquidity component score
  score += calculateThresholdScore(pairData.totalLiquidity, SCORING_CONFIG.PAIR_LIQUIDITY_THRESHOLDS);
  
  // Add volume component score  
  score += calculateThresholdScore(pairData.totalVolume24h, SCORING_CONFIG.PAIR_VOLUME_THRESHOLDS);
  
  return Math.round(score * 10) / 10;
};

const getOpportunityFrequency = (volume24h) => {
  if (volume24h > SCORING_CONFIG.PAIR_VOLUME_THRESHOLDS.TIER_3) return 'very_high';
  if (volume24h > SCORING_CONFIG.PAIR_VOLUME_THRESHOLDS.TIER_2) return 'high';
  if (volume24h > SCORING_CONFIG.PAIR_VOLUME_THRESHOLDS.TIER_1) return 'medium';
  if (volume24h > 10000) return 'low';
  return 'very_low';
};

/**
 * Save the final results to files
 */
const saveFinalResults = async (finalData, targetChain) => {
  // Sanitize filename to prevent path manipulation
  const sanitizedChain = targetChain.toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '') // Remove special chars
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 50); // Limit length
  
  const filename = `${sanitizedChain}_onchain_data.json`;
  const summaryFilename = `${sanitizedChain}_summary.json`;
  
  // Save complete data
  await fs.writeFile(filename, JSON.stringify(finalData, null, 2));
  console.log(`✅ Complete data saved to: ${filename}`);
  
  // Save summary with correct property access
  const summary = {
    metadata: finalData.metadata,
    chainInfo: {
      id: finalData.metadata.chain.id,
      name: finalData.metadata.chain.name,
      chain_id: finalData.metadata.chain.chain_id,
      native_token: finalData.metadata.chain.native_token
    },
    dexSummary: Object.values(finalData.dexes).map(dex => {
      // Get top pools for this DEX by filtering all pools
      const dexPools = Object.values(finalData.pools).filter(pool => pool.dexId === dex.id);
      
      return {
        name: dex.name,
        id: dex.id,
        type: dex.type,
        poolCount: dex.poolCount,
        totalLiquidity: dex.totalLiquidity,
        topPoolsByLiquidity: dexPools
          .sort((a, b) => parseFloat(b.economics.reserveUSD || 0) - parseFloat(a.economics.reserveUSD || 0))
          .slice(0, 5)
          .map(pool => ({
            name: pool.name,
            address: pool.address,
            reserveUSD: pool.economics.reserveUSD,
            volumeUSD24h: pool.activity.volumeUSD24h
          }))
      };
    }),
    topTokensByPoolCount: Object.entries(finalData.tokens)
      .map(([address, tokenData]) => {
        return {
          address,
          symbol: tokenData.symbol || 'Unknown',
          name: tokenData.name || 'Unknown',
          poolCount: tokenData.poolCount || 0
        };
      })
      .sort((a, b) => b.poolCount - a.poolCount)
      .slice(0, 20),
    tradingPairsSummary: {
      totalPairs: finalData.metadata.totalTradingPairs,
      topPairs: Object.entries(finalData.tradingPairs)
        .sort(([,a], [,b]) => b.tradingScore - a.tradingScore)
        .slice(0, 10)
        .map(([pairKey, pairData]) => ({
          pair: pairKey,
          tradingScore: pairData.tradingScore,
          availableDexes: pairData.availableDexes,
          totalLiquidity: pairData.totalLiquidity,
          totalVolume24h: pairData.totalVolume24h,
          opportunityFrequency: pairData.opportunityFrequency
        }))
    }
  };
  
  await fs.writeFile(summaryFilename, JSON.stringify(summary, null, 2));
  console.log(`✅ Summary saved to: ${summaryFilename}`);
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create helper functions to work with the aggregated data
 */
const createDataHelpers = (aggregatedData) => {
  return {
    getToken: (address) => aggregatedData.tokens[address] || null,
    
    getPoolsForToken: (address) => {
      const pools = [];
      for (const pool of Object.values(aggregatedData.pools)) {
        if (pool.baseToken === address || pool.quoteToken === address) {
          const dex = aggregatedData.dexes[pool.dexId];
          pools.push({
            dexName: dex?.name || 'Unknown',
            dexId: pool.dexId,
            pool
          });
        }
      }
      return pools;
    },
    
    getDexByName: (name) => {
      return Object.values(aggregatedData.dexes).find(dex => 
        dex.name.toLowerCase().includes(name.toLowerCase())
      );
    },
    
    getTopPoolsByLiquidity: (limit = 10) => {
      const allPools = [];
      for (const pool of Object.values(aggregatedData.pools)) {
        const dex = aggregatedData.dexes[pool.dexId];
        allPools.push({
          dexName: dex?.name || 'Unknown',
          pool
        });
      }
      return allPools
        .sort((a, b) => safeParseFloat(b.pool.economics.reserveUSD) - safeParseFloat(a.pool.economics.reserveUSD))
        .slice(0, limit);
    }
  };
};

// ============================================================================
// EXECUTION
// ============================================================================

/**
 * Main execution function
 */
const main = async () => {
  // You can change this to any supported chain
  const targetChain = 'arbitrum'; // or 'ethereum', 'polygon_pos', 'arbitrum', etc.
  
  if (TEST_MODE) {
    console.log('🧪 =================== TEST MODE ENABLED ===================');
    console.log(`🧪 Will process: ${TEST_MAX_DEXES} DEX(es), ${TEST_MAX_POOLS_PER_DEX} pool(s) per DEX`);
    console.log('🧪 Expected API calls: ~5-6 calls total');
    console.log('🧪 To disable: Set TEST_MODE = false at top of file');
    console.log('🧪 =========================================================\n');
  }
  
  try {
    const aggregatedData = await aggregateChainData(targetChain);
    
    // Example usage of helper functions
    const helpers = createDataHelpers(aggregatedData);
    
    console.log('\n📋 Example Helper Usage:');
    if (TEST_MODE) {
      console.log('🧪 TEST MODE RESULTS:');
      console.log(`   - Chain: ${aggregatedData.metadata.chain.name} (${aggregatedData.metadata.chain.id})`);
      console.log(`   - DEXes processed: ${aggregatedData.metadata.totalDexes}`);
      console.log(`   - Pools processed: ${aggregatedData.metadata.totalPools}`);
      console.log(`   - Unique tokens found: ${Object.keys(aggregatedData.tokens).length}`);
      
      if (aggregatedData.metadata.totalPools > 0) {
        const topPools = helpers.getTopPoolsByLiquidity(1);
        console.log('\n🏊 Pool processed:');
        topPools.forEach((item, i) => {
          console.log(`  ${i+1}. ${item.pool.name} (${item.dexName}) - $${parseFloat(item.pool.economics.reserveUSD || 0).toLocaleString()}`);
        });
      }
    } else {
      console.log('Top 5 pools by liquidity:');
      const topPools = helpers.getTopPoolsByLiquidity(5);
      topPools.forEach((item, i) => {
        console.log(`  ${i+1}. ${item.pool.name} (${item.dexName}) - $${parseFloat(item.pool.economics.reserveUSD || 0).toLocaleString()}`);
      });
    }
    
  } catch (error) {
    console.error('💥 Main execution failed:', error.message);
    process.exit(1);
  }
};

// ============================================================================
// STANDALONE CACHE HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch and save asset platforms data
 * Run this manually to refresh asset platforms cache
 */
const fetchAssetPlatforms = async () => {
  console.log('🌍 Fetching asset platforms data...');
  
  try {
    const assetPlatforms = await makeRequest('/asset_platforms', 'Fetching asset platforms for cache');
    
    await fs.writeFile('asset_platforms_cache.json', JSON.stringify(assetPlatforms, null, 2));
    console.log(`✅ Asset platforms cache saved: ${assetPlatforms.length} platforms`);
    
    return assetPlatforms;
  } catch (error) {
    console.error('❌ Failed to fetch asset platforms:', error.message);
    throw error;
  }
};

/**
 * Fetch and save networks data
 * Run this manually to refresh networks cache
 */
const fetchNetworks = async () => {
  console.log('🌐 Fetching networks data...');
  
  try {
    const response = await makeRequest('/onchain/networks', 'Fetching networks for cache');
    const networks = response.data || [];
    
    await fs.writeFile('networks_cache.json', JSON.stringify(networks, null, 2));
    console.log(`✅ Networks cache saved: ${networks.length} networks`);
    
    return networks;
  } catch (error) {
    console.error('❌ Failed to fetch networks:', error.message);
    throw error;
  }
};

/**
 * Aggregate asset platforms and networks into a single chains reference file
 * Run this after fetching both asset platforms and networks
 */
const aggregateChainReference = async () => {
  console.log('🔗 Aggregating chain data...');
  
  try {
    // Read cached files
    const assetPlatformsContent = await fs.readFile('asset_platforms_cache.json', 'utf8');
    const networksContent = await fs.readFile('networks_cache.json', 'utf8');
    
    const assetPlatforms = JSON.parse(assetPlatformsContent);
    const networks = JSON.parse(networksContent);
    
    // Create lookup map for networks
    const networkLookup = new Map();
    for (const network of networks) {
      networkLookup.set(network.id, network);
    }
    
    // Aggregate data
    const chainsReference = {};
    
    // Start with asset platforms as the base
    for (const platform of assetPlatforms) {
      const network = networkLookup.get(platform.id);
      
      chainsReference[platform.id] = {
        id: platform.id,
        name: platform.name,
        chain_identifier: platform.chain_identifier,
        shortname: platform.shortname,
        native_coin_id: platform.native_coin_id,
        image: platform.image,
        hasNetwork: !!network,
        coingecko_asset_platform_id: platform.id,
        // Add network-specific data if available
        ...(network && {
          network_name: network.attributes.name,
          network_coingecko_asset_platform_id: network.attributes.coingecko_asset_platform_id
        })
      };
    }
    
    // Add any networks that don't have corresponding asset platforms
    for (const network of networks) {
      if (!chainsReference[network.id]) {
        chainsReference[network.id] = {
          id: network.id,
          name: network.attributes.name,
          chain_identifier: null, // Unknown from asset platforms
          shortname: null,
          native_coin_id: null,
          image: null,
          hasNetwork: true,
          coingecko_asset_platform_id: network.attributes.coingecko_asset_platform_id,
          network_name: network.attributes.name,
          network_coingecko_asset_platform_id: network.attributes.coingecko_asset_platform_id
        };
      }
    }
    
    // Save aggregated data
    await fs.writeFile('chains_reference.json', JSON.stringify(chainsReference, null, 2));
    
    const totalChains = Object.keys(chainsReference).length;
    const networksCount = Object.values(chainsReference).filter(c => c.hasNetwork).length;
    const platformsOnly = totalChains - networksCount;
    
    console.log(`✅ Chains reference saved:`);
    console.log(`   - Total chains: ${totalChains}`);
    console.log(`   - With DEX networks: ${networksCount}`);
    console.log(`   - Asset platforms only: ${platformsOnly}`);
    
    return chainsReference;
    
  } catch (error) {
    console.error('❌ Failed to aggregate chain data:', error.message);
    throw error;
  }
};

/**
 * Complete cache refresh - fetch and aggregate all data
 * Run this to completely refresh the chains reference
 */
const refreshChainCache = async () => {
  console.log('🔄 Starting complete chain cache refresh...');
  
  try {
    await fetchAssetPlatforms();
    await fetchNetworks();
    await aggregateChainReference();
    
    console.log('🎉 Chain cache refresh completed successfully!');
  } catch (error) {
    console.error('❌ Chain cache refresh failed:', error.message);
    throw error;
  }
};

// Export functions for use as a module
export {
  aggregateChainData,
  createDataHelpers,
  loadCheckpoint,
  saveCheckpoint,
  cleanupCheckpoint,
  // New cache functions
  fetchAssetPlatforms,
  fetchNetworks,
  aggregateChainReference,
  refreshChainCache,
  loadChainReference
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--refresh-cache')) {
    console.log('🔄 Refreshing chain cache...');
    refreshChainCache()
      .then(() => {
        console.log('✅ Cache refresh completed!');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Cache refresh failed:', error.message);
        process.exit(1);
      });
  } else {
    main();
  }
}
