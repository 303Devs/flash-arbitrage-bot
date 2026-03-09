require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-verify");

// Only use private key if it looks valid (0x + 64 hex chars = 66 chars)
const pk = process.env.PRIVATE_KEY || "";
const ACCOUNTS = /^0x[0-9a-fA-F]{64}$/.test(pk) ? [pk] : [];

/** @type {import("hardhat/config").HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },

  networks: {
    hardhat: {
      chainId: 1337,
      forking: process.env.MAINNET_FORK_URL
        ? {
            url: process.env.MAINNET_FORK_URL,
            blockNumber: process.env.FORK_BLOCK_NUMBER
              ? parseInt(process.env.FORK_BLOCK_NUMBER, 10)
              : undefined,
          }
        : undefined,
    },

    // Testnets
    arbitrumSepolia: {
      url: `https://arb-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}`,
      accounts: ACCOUNTS,
      chainId: 421614,
      gasPrice: 100000000,
    },
    baseSepolia: {
      url: `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}`,
      accounts: ACCOUNTS,
      chainId: 84532,
      gasPrice: 50000000,
    },
    polygonAmoy: {
      url: `https://rpc-amoy.polygon.technology/`,
      accounts: ACCOUNTS,
      chainId: 80002,
      gasPrice: 30000000000,
    },

    // Mainnets
    arbitrum: {
      url: process.env.QUICKNODE_ARBITRUM_HTTP ||
           `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}`,
      accounts: ACCOUNTS,
      chainId: 42161,
      gasPrice: 100000000,
    },
    polygon: {
      url: process.env.QUICKNODE_POLYGON_HTTP ||
           `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}`,
      accounts: ACCOUNTS,
      chainId: 137,
      gasPrice: 30000000000,
    },
    base: {
      url: process.env.QUICKNODE_BASE_HTTP ||
           `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}`,
      accounts: ACCOUNTS,
      chainId: 8453,
      gasPrice: 50000000,
    },
  },

  paths: {
    sources:   "./shared/contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  mocha: { timeout: 120000 },

  etherscan: {
    apiKey: {
      arbitrumOne: process.env.ETHERSCAN_API_KEY  || "",
      polygon:     process.env.POLYGONSCAN_API_KEY || "",
      base:        process.env.BASESCAN_API_KEY    || "",
    },
  },

  sourcify: { enabled: true },
};
