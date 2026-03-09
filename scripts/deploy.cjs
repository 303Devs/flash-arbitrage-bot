/**
 * DEPLOYMENT SCRIPT - ZeroCapitalArbitrage
 * Run with: hardhat run scripts/deploy.cjs --network <network>
 *
 * Testnet:  --network arbitrumSepolia | polygonAmoy | baseSepolia
 * Mainnet:  --network arbitrum | polygon | base
 */

const { ethers } = require("hardhat");
const fs = require('fs');
const path = require('path');

const NETWORK_CONFIGS = {
  // Testnets
  421614: { name: "Arbitrum Sepolia", aavePool: "0x0000000000000000000000000000000000000000", isTestnet: true },
  80002:  { name: "Polygon Amoy",     aavePool: "0x0000000000000000000000000000000000000000", isTestnet: true },
  84532:  { name: "Base Sepolia",     aavePool: "0x0000000000000000000000000000000000000000", isTestnet: true },
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
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const networkConfig = NETWORK_CONFIGS[chainId];

  if (!networkConfig) {
    throw new Error(`Unsupported network: chainId ${chainId}`);
  }

  console.log(`\n🚀 Deploying ZeroCapitalArbitrage`);
  console.log(`   Network: ${networkConfig.name} (${chainId})`);
  console.log(`   Deployer: ${deployer.address}`);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);

  if (!networkConfig.isTestnet && balance < ethers.parseEther("0.005")) {
    throw new Error(`Insufficient balance! Need at least 0.005 ETH for mainnet deployment`);
  }

  console.log(`\n📋 Deploying contract...`);
  const ZeroCapitalArbitrage = await ethers.getContractFactory("ZeroCapitalArbitrage");
  const contract = await ZeroCapitalArbitrage.deploy(networkConfig.aavePool);

  console.log(`   Waiting for confirmation...`);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const explorerUrl = EXPLORER_URLS[chainId]?.(address) || '';

  console.log(`\n✅ Deployment successful!`);
  console.log(`   Address: ${address}`);
  if (explorerUrl) console.log(`   Explorer: ${explorerUrl}`);

  // Update deployed addresses file
  updateDeployedAddresses(chainId, address);

  // Attempt contract verification
  if (!networkConfig.isTestnet) {
    console.log(`\n🔍 Verifying contract on explorer...`);
    try {
      await hre.run("verify:verify", {
        address,
        constructorArguments: [networkConfig.aavePool],
      });
      console.log(`   ✅ Verified`);
    } catch (err) {
      console.log(`   ⚠️  Verification failed: ${err.message}`);
      console.log(`   Verify manually: ${explorerUrl}`);
    }
  }

  console.log(`\n🎉 Done! Contract is ready.`);
  console.log(`   Next: run scripts/whitelist-dexs.ts to whitelist additional DEXs`);
}

function updateDeployedAddresses(chainId, contractAddress) {
  const filePath = path.join(__dirname, '../phases/phase1-arbitrage/src/contracts/deployed-addresses.ts');

  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  deployed-addresses.ts not found, skipping auto-update`);
    console.log(`   Manually set address for chain ${chainId}: ${contractAddress}`);
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
