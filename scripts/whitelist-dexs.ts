/**
 * Whitelist additional DEX routers on the deployed ZeroCapitalArbitrage contract
 *
 * The constructor already whitelists: Uniswap V3, Uniswap V2, SushiSwap
 * This script adds chain-specific DEXs after deployment.
 *
 * Usage: tsx scripts/whitelist-dexs.ts --network arbitrum
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

// Additional DEX routers to whitelist per chain (beyond the 3 in constructor)
const CHAIN_DEXS: Record<number, Array<{ name: string; router: string }>> = {
  42161: [ // Arbitrum
    { name: 'Camelot',    router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d' },
    { name: 'Curve',      router: '0x7544Fe977a8546c47cA37878CfcB8CF27B70C0D0' },
    { name: 'Balancer',   router: '0xBA12222222228d8Ba445958a75a0704d566BF2C8' },
  ],
  137: [ // Polygon
    { name: 'QuickSwap',  router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff' },
    { name: 'Curve',      router: '0x47bB542B9dE58b970bA50c9dae444DDB4c16751a' },
    { name: 'Balancer',   router: '0xBA12222222228d8Ba445958a75a0704d566BF2C8' },
  ],
  8453: [ // Base
    { name: 'Aerodrome',  router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' },
    { name: 'Curve',      router: '0xf3A6aa40cf048a3960E9664847E9a7be025a390a' },
    { name: 'Balancer',   router: '0xBA12222222228d8Ba445958a75a0704d566BF2C8' },
  ],
};

const CONTRACT_ABI = [
  'function updateDEXWhitelist(address dex, bool whitelisted) external',
  'function isDEXWhitelisted(address dex) external view returns (bool)',
  'function owner() external view returns (address)',
];

const DEPLOYED_ADDRESSES: Record<number, string> = {
  42161: process.env.ARBITRAGE_CONTRACT_ARBITRUM || '',
  137:   process.env.ARBITRAGE_CONTRACT_POLYGON  || '',
  8453:  process.env.ARBITRAGE_CONTRACT_BASE     || '',
};

const RPC_URLS: Record<number, string> = {
  42161: process.env.QUICKNODE_ARBITRUM_HTTP || `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  137:   process.env.QUICKNODE_POLYGON_HTTP  || `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
  8453:  process.env.QUICKNODE_BASE_HTTP     || `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
};

async function whitelistDEXs(chainId: number) {
  const contractAddress = DEPLOYED_ADDRESSES[chainId];
  if (!contractAddress) {
    console.log(`⚠️  No contract address for chain ${chainId}. Set ARBITRAGE_CONTRACT_* in .env`);
    return;
  }

  const rpcUrl = RPC_URLS[chainId];
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) throw new Error('PRIVATE_KEY not set in .env');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, wallet);

  const dexs = CHAIN_DEXS[chainId] || [];
  if (dexs.length === 0) {
    console.log(`No additional DEXs to whitelist for chain ${chainId}`);
    return;
  }

  console.log(`\n📋 Whitelisting DEXs on chain ${chainId} (${contractAddress})`);

  for (const dex of dexs) {
    const isAlreadyWhitelisted = await contract.isDEXWhitelisted(dex.router);
    if (isAlreadyWhitelisted) {
      console.log(`  ✅ ${dex.name} already whitelisted`);
      continue;
    }

    console.log(`  🔄 Whitelisting ${dex.name} (${dex.router})...`);
    try {
      const tx = await contract.updateDEXWhitelist(dex.router, true);
      await tx.wait();
      console.log(`  ✅ ${dex.name} whitelisted (tx: ${tx.hash})`);
    } catch (err: any) {
      console.error(`  ❌ Failed to whitelist ${dex.name}: ${err.message}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const networkFlag = args.find(a => a.startsWith('--network=') || args[args.indexOf('--network') + 1]);
  const networkName = networkFlag?.replace('--network=', '') || args[args.indexOf('--network') + 1];

  const networkToChainId: Record<string, number> = {
    arbitrum: 42161,
    polygon:  137,
    base:     8453,
  };

  if (networkName && networkToChainId[networkName]) {
    await whitelistDEXs(networkToChainId[networkName]);
  } else {
    // Run on all chains
    console.log('Running on all chains...');
    for (const chainId of [42161, 137, 8453]) {
      await whitelistDEXs(chainId);
    }
  }

  console.log('\n✅ Done!');
}

main().catch(console.error);
