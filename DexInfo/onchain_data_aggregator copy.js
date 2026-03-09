import fs from 'fs/promises';

// ============================================================================
// CONFIGURATION
// ============================================================================

// TODO: Paste your API key here
const API_KEY = 'CG-dgAPa1NhXtTyw8f9YJ1Fx25w'; // Replace with your demo API key

const BASE_URL = 'https://api.coingecko.com/api/v3';
const REQUEST_DELAY = 2000; // 2 seconds between requests (30 calls/minute = ~2s delay)
const MAX_RETRIES = 3;
const THROTTLE_WAIT_TIME = 60000; // 1 minute wait when throttled

// 🧪 TEST MODE - Set to true for testing with minimal API calls
const TEST_MODE = false; // TODO: Set to false for full processing
const TEST_MAX_DEXES = 3; // Only process first DEX in test mode
const TEST_MAX_POOLS_PER_DEX = 2; // Only process first pool per DEX in test mode

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// CHECKPOINT FUNCTIONS
// ============================================================================

/**
 * Save checkpoint of current progress with granular details
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
    console.log(`📂 Checkpoint found: Last completed step was "${checkpoint.step}"`);
    console.log(`📅 Last checkpoint: ${checkpoint.metadata.timestamp}`);
    return checkpoint;
  } catch (error) {
    console.log('📂 No checkpoint found, starting fresh');
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
 */
const makeRequest = async (endpoint, description = '') => {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method: 'GET',
    headers: {
      'accept': 'application/json',
      'x-cg-demo-api-key': API_KEY
    }
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`🔍 ${description} (attempt ${attempt}/${MAX_RETRIES})`);
      console.log(`   URL: ${url}`);

      const response = await fetch(url, options);
      const responseText = await response.text();

      // Check for throttling (your existing detection logic)
      if (responseText.includes('Throttled') || responseText.includes('Rate limit') || response.status === 429) {
        console.log(`⏳ Throttled! Waiting ${THROTTLE_WAIT_TIME / 1000} seconds before retry...`);
        await sleep(THROTTLE_WAIT_TIME);
        continue;
      }

      if (response.status !== 200) {
        console.log(`❌ HTTP ${response.status} for ${description}`);
        if (attempt < MAX_RETRIES) {
          await sleep(2000);
          continue;
        } else {
          // After max retries, throw error to stop entire script
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }
      }

      const json = JSON.parse(responseText);
      console.log(`  ✅ ${description} - Success`);

      // Rate limiting delay (except for last request in a series)
      await sleep(REQUEST_DELAY);

      return json;

    } catch (error) {
      console.error(`💥 Error in ${description}: ${error.message}`);
      
      if (error.message.includes('Throttled') || error.message.includes('JSON')) {
        console.log(`⏳ Detected throttling error, waiting ${THROTTLE_WAIT_TIME / 1000} seconds...`);
        await sleep(THROTTLE_WAIT_TIME);
        continue;
      } else if (attempt < MAX_RETRIES) {
        console.log(`🔄 Retrying in 2 seconds... (${attempt}/${MAX_RETRIES})`);
        await sleep(2000);
      } else {
        // After max retries, throw error to stop entire script
        throw error;
      }
    }
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
 */
const getPoolsForDex = async (chainId, dexId, dexName, tokenLookup, startPage = 1) => {
  console.log(`\n💰 Step 3: Fetching pools for ${dexName} (${dexId}) with token data...`);
  
  if (TEST_MODE) {
    console.log(`🧪 TEST MODE: Limited to ${TEST_MAX_POOLS_PER_DEX} pool(s) per DEX`);
  }
  
  let allPools = [];
  let page = startPage;
  let hasMorePages = true;
  let tokensAdded = 0;
  
  while (hasMorePages && page <= 10) {
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
        
        // Now increment pool count for tokens in the pools we're actually processing
        for (const pool of poolsToAdd) {
          const baseTokenAddress = pool.relationships?.base_token?.data?.id?.split('_')[1];
          const quoteTokenAddress = pool.relationships?.quote_token?.data?.id?.split('_')[1];
          
          // Increment pool count for base token
          if (baseTokenAddress && tokenLookup.has(baseTokenAddress)) {
            tokenLookup.get(baseTokenAddress).poolCount++;
          }
          
          // Increment pool count for quote token  
          if (quoteTokenAddress && tokenLookup.has(quoteTokenAddress)) {
            tokenLookup.get(quoteTokenAddress).poolCount++;
          }
        }
        
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
          if (page > 10) {
            console.log(`  ⚠️  Reached CoinGecko free tier page limit (10), stopping`);
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
 */
const getCompletePoolData = async (chainId, pools, startPoolIndex = 0) => {
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
      
      // Save checkpoint every 10 pools to avoid losing progress
      if ((i + 1) % 10 === 0 || i === pools.length - 1) {
        // This checkpoint will be saved by the calling function
        console.log(`  💾 Progress: ${i + 1}/${pools.length} pools completed`);
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
      if (checkpoint.tokenLookup) {
        tokenLookup = new Map(Object.entries(checkpoint.tokenLookup));
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
          
          const { pools, tokensAdded } = await getPoolsForDex(
            chainData.chainInfo.id, 
            dex.id, 
            dex.name, 
            tokenLookup, 
            currentPage
          );
          
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
    
    const completePoolData = await getCompletePoolData(chainData.chainInfo.id, allPools, startPoolIndex);
    
    // Update chainData with complete pool data
    let poolIndex = 0;
    for (let i = 0; i < chainData.dexes.length; i++) {
      const dex = chainData.dexes[i];
      const updatedPools = completePoolData.slice(poolIndex, poolIndex + dex.pools.length);
      chainData.dexes[i].pools = updatedPools;
      poolIndex += dex.pools.length;
    }
    
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
 * Create the final optimized data structure for arbitrage bot
 */
const createFinalDataStructure = (chainData, tokenLookup) => {
  console.log('\n📊 Creating final arbitrage-optimized data structure...');
  
  // Convert token lookup to object
  const tokenLookupObj = {};
  for (const [address, tokenData] of tokenLookup) {
    tokenLookupObj[address] = tokenData;
  }
  
  // Initialize the new structure
  const finalData = {
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
      totalArbitragePairs: 0
    },
    dexes: {},
    tokens: tokenLookupObj,
    pools: {},
    arbitragePairs: {},
    rankings: {
      topPoolsByVolume: [],
      topPoolsByLiquidity: [],
      topArbitragePairs: []
    }
  };
  
  // Process DEXes and pools
  const allPools = [];
  const pairGroups = new Map(); // For grouping same pairs across DEXes
  
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
      const baseTokenAddress = pool.relationships?.base_token?.data?.id?.split('_')[1];
      const quoteTokenAddress = pool.relationships?.quote_token?.data?.id?.split('_')[1];
      
      if (!baseTokenAddress || !quoteTokenAddress) continue;
      
      const baseToken = tokenLookupObj[baseTokenAddress];
      const quoteToken = tokenLookupObj[quoteTokenAddress];
      
      if (!baseToken || !quoteToken) continue;
      
      // Create pair key for grouping (always alphabetical order)
      const pairKey = createPairKey(baseToken.symbol, quoteToken.symbol);
      
      // Calculate available liquidity (total - locked)
      const reserveUSD = parseFloat(pool.attributes.reserve_in_usd || 0);
      const lockedPercentage = parseFloat(pool.attributes.locked_liquidity_percentage || 0);
      const availableLiquidityUSD = reserveUSD * (1 - lockedPercentage / 100);
      
      // Create rich pool object
      const poolData = {
        address: pool.attributes.address,
        name: pool.attributes.name,
        dexId: dex.id,
        baseToken: baseTokenAddress,
        quoteToken: quoteTokenAddress,
        pairKey,
        economics: {
          feePercentage: pool.attributes.pool_fee_percentage || "0",
          reserveUSD: pool.attributes.reserve_in_usd || "0",
          lockedLiquidityPercentage: pool.attributes.locked_liquidity_percentage || "0",
          availableLiquidityUSD: availableLiquidityUSD.toString()
        },
        pricing: {
          baseTokenPriceUSD: pool.attributes.base_token_price_usd || "0",
          quoteTokenPriceUSD: pool.attributes.quote_token_price_usd || "0",
          baseTokenPriceQuoteToken: pool.attributes.base_token_price_quote_token || "0",
          priceChangePercentage24h: pool.attributes.price_change_percentage?.h24 || "0"
        },
        activity: {
          volumeUSD24h: pool.attributes.volume_usd?.h24 || "0",
          volumeUSD1h: pool.attributes.volume_usd?.h1 || "0",
          transactions24h: {
            buys: pool.attributes.transactions?.h24?.buys || 0,
            sells: pool.attributes.transactions?.h24?.sells || 0,
            total: (pool.attributes.transactions?.h24?.buys || 0) + (pool.attributes.transactions?.h24?.sells || 0)
          },
          transactions1h: {
            buys: pool.attributes.transactions?.h1?.buys || 0,
            sells: pool.attributes.transactions?.h1?.sells || 0,
            total: (pool.attributes.transactions?.h1?.buys || 0) + (pool.attributes.transactions?.h1?.sells || 0)
          }
        },
        arbitrageMetrics: calculateArbitrageMetrics(pool, reserveUSD, availableLiquidityUSD)
      };
      
      // Add to pools
      finalData.pools[pool.attributes.address] = poolData;
      allPools.push(poolData);
      
      // Group by pair for arbitrage opportunities
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
      pairGroup.totalLiquidity += reserveUSD;
      pairGroup.totalVolume24h += parseFloat(pool.attributes.volume_usd?.h24 || 0);
    }
  }
  
  // Create arbitrage pairs (only pairs with multiple DEXes)
  for (const [pairKey, pairData] of pairGroups) {
    if (pairData.availableDexes.length > 1) {
      finalData.arbitragePairs[pairKey] = {
        baseToken: pairData.baseToken,
        quoteToken: pairData.quoteToken,
        availableDexes: pairData.availableDexes,
        pools: pairData.pools,
        totalLiquidity: pairData.totalLiquidity.toString(),
        totalVolume24h: pairData.totalVolume24h.toString(),
        arbitrageScore: calculatePairArbitrageScore(pairData),
        avgSpread: "0.05", // Placeholder - would need price comparison
        opportunityFrequency: getOpportunityFrequency(pairData.totalVolume24h)
      };
    }
  }
  
  // Update metadata
  finalData.metadata.totalPools = allPools.length;
  finalData.metadata.totalArbitragePairs = Object.keys(finalData.arbitragePairs).length;
  
  // Create rankings
  finalData.rankings.topPoolsByVolume = allPools
    .sort((a, b) => parseFloat(b.activity.volumeUSD24h) - parseFloat(a.activity.volumeUSD24h))
    .slice(0, 10)
    .map(p => p.address);
    
  finalData.rankings.topPoolsByLiquidity = allPools
    .sort((a, b) => parseFloat(b.economics.reserveUSD) - parseFloat(a.economics.reserveUSD))
    .slice(0, 10)
    .map(p => p.address);
    
  finalData.rankings.topArbitragePairs = Object.entries(finalData.arbitragePairs)
    .sort(([,a], [,b]) => b.arbitrageScore - a.arbitrageScore)
    .slice(0, 10)
    .map(([pairKey]) => pairKey);
  
  console.log(`✅ Arbitrage-optimized structure created:`);
  console.log(`   - Chain: ${finalData.metadata.chain.name} (${finalData.metadata.chain.id})`);
  console.log(`   - DEXes: ${finalData.metadata.totalDexes}`);
  console.log(`   - Pools: ${finalData.metadata.totalPools}`);
  console.log(`   - Arbitrage Pairs: ${finalData.metadata.totalArbitragePairs}`);
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

const calculateArbitrageMetrics = (pool, reserveUSD, availableLiquidityUSD) => {
  const volume24h = parseFloat(pool.attributes.volume_usd?.h24 || 0);
  const transactions24h = (pool.attributes.transactions?.h24?.buys || 0) + (pool.attributes.transactions?.h24?.sells || 0);
  
  // Simple scoring based on liquidity, volume, and activity
  let score = 0;
  
  // Liquidity component (0-4 points)
  if (availableLiquidityUSD > 10000000) score += 4; // $10M+
  else if (availableLiquidityUSD > 1000000) score += 3; // $1M+
  else if (availableLiquidityUSD > 100000) score += 2; // $100K+
  else if (availableLiquidityUSD > 10000) score += 1; // $10K+
  
  // Volume component (0-3 points)
  if (volume24h > 1000000) score += 3; // $1M+ daily volume
  else if (volume24h > 100000) score += 2; // $100K+ daily volume
  else if (volume24h > 10000) score += 1; // $10K+ daily volume
  
  // Activity component (0-3 points)
  if (transactions24h > 1000) score += 3; // Very active
  else if (transactions24h > 100) score += 2; // Active
  else if (transactions24h > 10) score += 1; // Some activity
  
  return {
    score: Math.round(score * 10) / 10, // Round to 1 decimal
    rank: 0, // Will be calculated later in rankings
    maxTradeSize: Math.min(availableLiquidityUSD * 0.1, 1000000).toString(), // 10% of liquidity, max $1M
    avgSpread: "0.02", // Placeholder - would need real spread calculation
    competitorPools: 0 // Will be calculated when processing arbitrage pairs
  };
};

const calculatePairArbitrageScore = (pairData) => {
  let score = 0;
  
  // More DEXes = better arbitrage opportunities
  score += pairData.availableDexes.length * 2;
  
  // Higher total liquidity = better
  if (pairData.totalLiquidity > 50000000) score += 3; // $50M+
  else if (pairData.totalLiquidity > 10000000) score += 2; // $10M+
  else if (pairData.totalLiquidity > 1000000) score += 1; // $1M+
  
  // Higher volume = more opportunities
  if (pairData.totalVolume24h > 10000000) score += 3; // $10M+
  else if (pairData.totalVolume24h > 1000000) score += 2; // $1M+
  else if (pairData.totalVolume24h > 100000) score += 1; // $100K+
  
  return Math.round(score * 10) / 10;
};

const getOpportunityFrequency = (volume24h) => {
  if (volume24h > 10000000) return 'very_high';
  if (volume24h > 1000000) return 'high';
  if (volume24h > 100000) return 'medium';
  if (volume24h > 10000) return 'low';
  return 'very_low';
};

/**
 * Save the final results to files
 */
const saveFinalResults = async (finalData, targetChain) => {
  const filename = `${targetChain.toLowerCase().replace(/\s+/g, '_')}_onchain_data.json`;
  const summaryFilename = `${targetChain.toLowerCase().replace(/\s+/g, '_')}_summary.json`;
  
  // Save complete data
  await fs.writeFile(filename, JSON.stringify(finalData, null, 2));
  console.log(`✅ Complete data saved to: ${filename}`);
  
  // Save summary
  const summary = {
    metadata: finalData.metadata,
    chainInfo: {
      id: finalData.id,
      name: finalData.name,
      chain_identifier: finalData.chain_identifier,
      shortname: finalData.shortname
    },
    dexSummary: finalData.dexes.map(dex => ({
      name: dex.name,
      id: dex.id,
      poolCount: dex.pools.length,
      topPoolsByLiquidity: dex.pools
        .sort((a, b) => parseFloat(b.reserve_in_usd || 0) - parseFloat(a.reserve_in_usd || 0))
        .slice(0, 5)
        .map(pool => ({
          name: pool.name,
          address: pool.address,
          reserve_in_usd: pool.reserve_in_usd
        }))
    })),
    topTokensByPoolCount: Object.entries(finalData.tokenLookup)
      .map(([address, tokenData]) => {
        const poolCount = finalData.dexes.reduce((count, dex) => 
          count + dex.pools.filter(pool => 
            pool.baseTokenAddress === address || pool.quoteTokenAddress === address
          ).length, 0
        );
        return {
          address,
          symbol: tokenData.symbol || 'Unknown',
          name: tokenData.name || 'Unknown',
          poolCount
        };
      })
      .sort((a, b) => b.poolCount - a.poolCount)
      .slice(0, 20)
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
    getToken: (address) => aggregatedData.tokenLookup[address] || null,
    
    getPoolsForToken: (address) => {
      const pools = [];
      for (const dex of aggregatedData.dexes) {
        for (const pool of dex.pools) {
          if (pool.baseTokenAddress === address || pool.quoteTokenAddress === address) {
            pools.push({
              dexName: dex.name,
              dexId: dex.id,
              pool
            });
          }
        }
      }
      return pools;
    },
    
    getDexByName: (name) => {
      return aggregatedData.dexes.find(dex => 
        dex.name.toLowerCase().includes(name.toLowerCase())
      );
    },
    
    getTopPoolsByLiquidity: (limit = 10) => {
      const allPools = [];
      for (const dex of aggregatedData.dexes) {
        for (const pool of dex.pools) {
          allPools.push({
            dexName: dex.name,
            pool
          });
        }
      }
      return allPools
        .sort((a, b) => parseFloat(b.pool.reserve_in_usd || 0) - parseFloat(a.pool.reserve_in_usd || 0))
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
      console.log(`   - Chain: ${aggregatedData.name} (${aggregatedData.id})`);
      console.log(`   - DEXes processed: ${aggregatedData.metadata.totalDexes}`);
      console.log(`   - Pools processed: ${aggregatedData.metadata.totalPools}`);
      console.log(`   - Unique tokens found: ${aggregatedData.metadata.totalUniqueTokens}`);
      
      if (aggregatedData.metadata.totalPools > 0) {
        const topPools = helpers.getTopPoolsByLiquidity(1);
        console.log('\n🏊 Pool processed:');
        topPools.forEach((item, i) => {
          console.log(`  ${i+1}. ${item.pool.name} (${item.dexName}) - $${parseFloat(item.pool.reserve_in_usd || 0).toLocaleString()}`);
        });
      }
    } else {
      console.log('Top 5 pools by liquidity:');
      const topPools = helpers.getTopPoolsByLiquidity(5);
      topPools.forEach((item, i) => {
        console.log(`  ${i+1}. ${item.pool.name} (${item.dexName}) - $${parseFloat(item.pool.reserve_in_usd || 0).toLocaleString()}`);
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
