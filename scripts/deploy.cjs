/**
 * DEPLOYMENT SCRIPT - ZeroCapitalArbitrage
 * Run with: hardhat run scripts/deploy.cjs --network <network>
 *
 * Testnet:  --network arbitrumSepolia | polygonAmoy | baseSepolia
 * Mainnet:  --network arbitrum | polygon | base
 */

const { ethers } = require("hardhat");
const fs   = require('fs');
const path = require('path');

// Chain-specific DEX routers to whitelist at deployment
// These are the routers the contract will be allowed to call
const DEX_ROUTERS = {
  // Arbitrum One (42161)
  42161: [
    '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 Router
    '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap V3 Router 02
    '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap
    '0xc873fEcbd354f5A56E00E710B90EF4201db2448d', // Camelot
    '0xBA12222222228d8Ba445958a75a0704d566BF2C8', // Balancer Vault
    '0x7544Fe977a8546c47cA37878CfcB8CF27B70C0D0', // Curve Router
  ],
  // Polygon (137)
  137: [
    '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 Router
    '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', // Uniswap V3 Router 02
    '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap
    '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', // QuickSwap V2
    '0xBA12222222228d8Ba445958a75a0704d566BF2C8', // Balancer Vault
    '0x47bB542B9dE58b970bA50c9dae444DDB4c16751a', // Curve Router
  ],
  // Base (8453)
  8453: [
    '0x2626664c2603336E57B271c5C0b26F421741e481', // Uniswap V3 Router (Base-specific!)
    '0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC', // Uniswap V3 Router 02 (Base)
    '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43', // Aerodrome
    '0xBA12222222228d8Ba445958a75a0704d566BF2C8', // Balancer Vault
    '0xf3A6aa40cf048a3960E9664847E9a7be025a390a', // Curve Router
  ],
  // Arbitrum Sepolia (421614)
  421614: [
    '0x101F443B4d1b059569D643917553c771E1b9663E', // Uniswap V3 Router (Sepolia)
  ],
  // Polygon Amoy (80002)
  80002: [],
  // Base Sepolia (84532)
  84532: [
    '0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4', // Uniswap V3 Router (Base Sepolia)
  ],
};

const NETWORK_CONFIGS = {
  // Testnets - Aave V3 testnet pool addresses
  421614: { name: "Arbitrum Sepolia", aavePool: "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff", isTestnet: true  },
  80002:  { name: "Polygon Amoy",     aavePool: "0xcC6114B983E4Ed2737E9BD3961c9924e6216c704", isTestnet: true  },
  84532:  { name: "Base Sepolia",     aavePool: "0x07eA79F68B2B3df564D0A34F8e19791234D9d6c4", isTestnet: true  },
  // Mainnets
  42161:  { name: "Arbitrum One",     aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", isTestnet: false },
  137:    { name: "Polygon",          aavePool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", isTestnet: false },
  8453:   { name: "Base",             aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", isTestnet: false },
};

const EXPLORER_URLS = {
  42161:  (addr) => `https://arbiscan.io/address/${addr}`,
  137:    (addr) => `https://polygonscan.com/address/${addr}`,
  8453:   (addr) => `https://basescan.org/address/${addr}`,
  421614: (addr) => `https://sepolia.arbiscan.io/address/${addr}`,
  80002:  (addr) => `https://www.oklink.com/amoy/address/${addr}`,
  84532:  (addr) => `https://sepolia.basescan.org/address/${addr}`,
};

async function main() {
  const [deployer]    = await ethers.getSigners();
  const network       = await ethers.provider.getNetwork();
  const chainId       = Number(network.chainId);
  const networkConfig = NETWORK_CONFIGS[chainId];

  if (!networkConfig) throw new Error(`Unsupported network: chainId ${chainId}`);

  const dexRouters = DEX_ROUTERS[chainId] || [];

  console.log(`\n🚀 Deploying ZeroCapitalArbitrage`);
  console.log(`   Network:  ${networkConfig.name} (${chainId})`);
  console.log(`   Deployer: ${deployer.address}`);
  console.log(`   Aave Pool: ${networkConfig.aavePool}`);
  console.log(`   Whitelisting ${dexRouters.length} DEX routers`);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

  if (!networkConfig.isTestnet && balance < ethers.parseEther("0.005")) {
    throw new Error(`Insufficient balance! Need at least 0.005 ETH for mainnet deployment`);
  }

  console.log(`\n📋 Deploying contract...`);
  const ZeroCapitalArbitrage = await ethers.getContractFactory("ZeroCapitalArbitrage");
  const contract = await ZeroCapitalArbitrage.deploy(networkConfig.aavePool, dexRouters);

  console.log(`   Waiting for confirmation...`);
  await contract.waitForDeployment();

  const address      = await contract.getAddress();
  const explorerUrl  = EXPLORER_URLS[chainId]?.(address) || '';

  console.log(`\n✅ Deployment successful!`);
  console.log(`   Address: ${address}`);
  if (explorerUrl) console.log(`   Explorer: ${explorerUrl}`);

  // Update deployed addresses file
  updateDeployedAddresses(chainId, address);

  // Verify on block explorer
  if (process.env.VERIFY !== 'false') {
    console.log(`\n🔍 Verifying contract...`);
    try {
      const hre = require('hardhat');
      await hre.run("verify:verify", {
        address,
        constructorArguments: [networkConfig.aavePool, dexRouters],
      });
      console.log(`   ✅ Verified`);
    } catch (err) {
      console.log(`   ⚠️  Verification failed: ${err.message}`);
      if (explorerUrl) console.log(`   Verify manually: ${explorerUrl}`);
    }
  }

  console.log(`\n🎉 Done! Contract deployed and ${dexRouters.length} DEXs whitelisted.`);
  console.log(`   The bot wallet (${deployer.address}) is already an authorized executor.`);
}

function updateDeployedAddresses(chainId, contractAddress) {
  const filePath = path.join(__dirname, '../phases/phase1-arbitrage/src/contracts/deployed-addresses.ts');

  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  deployed-addresses.ts not found - manually set chain ${chainId}: ${contractAddress}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  const placeholder = '0x0000000000000000000000000000000000000000';

  const chainComments = {
    42161:  '// Arbitrum One (42161)',
    137:    '// Polygon (137)',
    8453:   '// Base (8453)',
    421614: '// Arbitrum Sepolia (421614)',
    80002:  '// Polygon Amoy (80002)',
    84532:  '// Base Sepolia (84532)',
  };

  const comment = chainComments[chainId];
  if (!comment) return;

  const regex = new RegExp(
    `(${comment.replace(/[()]/g, '\\$&')}[\\s\\S]*?ZeroCapitalArbitrage:\\s*")(${placeholder})(")`
  );

  if (content.match(regex)) {
    content = content.replace(regex, `$1${contractAddress}$3`);
    fs.writeFileSync(filePath, content);
    console.log(`   ✅ Updated deployed-addresses.ts`);
  } else {
    console.log(`   ⚠️  Could not auto-update deployed-addresses.ts`);
    console.log(`   Manually set chain ${chainId} address to: ${contractAddress}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n❌ Deployment failed:`, error.message);
    process.exit(1);
  });
