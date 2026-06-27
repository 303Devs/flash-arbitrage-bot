import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

describe('project structure', () => {
  it('keeps the active arbitrage contract in the Hardhat source tree', () => {
    expect(existsSync('shared/contracts/implementations/ZeroCapitalArbitrage.sol')).toBe(true);
  });

  it('keeps the phase 1 app available for the root dev script', () => {
    expect(existsSync('phases/phase1-arbitrage/src/main.ts')).toBe(true);
  });
});
