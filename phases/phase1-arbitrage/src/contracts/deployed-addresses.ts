/**
 * Deployed ZeroCapitalArbitrage contract addresses
 * Updated automatically by scripts/deploy.cjs after each deployment
 *
 * To deploy: cd /path/to/BOT && pnpm deploy:arbitrum (or polygon/base/testnets)
 */

export interface DeployedContracts {
  ZeroCapitalArbitrage: string;
}

export const DEPLOYED_ADDRESSES: Record<'mainnet' | 'testnet', Record<number, DeployedContracts>> = {
  mainnet: {
    // Arbitrum One (42161)
    42161: { ZeroCapitalArbitrage: "0x0000000000000000000000000000000000000000" },
    // Polygon (137)
    137:   { ZeroCapitalArbitrage: "0x0000000000000000000000000000000000000000" },
    // Base (8453)
    8453:  { ZeroCapitalArbitrage: "0x0000000000000000000000000000000000000000" },
  },
  testnet: {
    // Arbitrum Sepolia (421614)
    421614: { ZeroCapitalArbitrage: "0x0000000000000000000000000000000000000000" },
    // Polygon Amoy (80002)
    80002:  { ZeroCapitalArbitrage: "0x0000000000000000000000000000000000000000" },
    // Base Sepolia (84532)
    84532:  { ZeroCapitalArbitrage: "0x0000000000000000000000000000000000000000" },
  },
};

const TESTNET_CHAIN_IDS = new Set([421614, 80002, 84532]);

export function getContractAddress(chainId: number): string | null {
  const env = TESTNET_CHAIN_IDS.has(chainId) ? 'testnet' : 'mainnet';
  const addr = DEPLOYED_ADDRESSES[env][chainId]?.ZeroCapitalArbitrage;
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return null;
  return addr;
}
