import { describe, expect, it } from 'vitest';
import { config, env } from '../src/config/environment.js';

describe('environment defaults', () => {
  it('loads safe development defaults without real secrets', () => {
    expect(['development', 'test']).toContain(env.NODE_ENV);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.PRIVATE_KEY).toBe('');
  });

  it('derives numeric gas and profit config from defaults', () => {
    expect(config.gas.maxGasPrice[42161]).toBeGreaterThan(0n);
    expect(config.profit.minimumUSD[42161]).toBeGreaterThan(0);
  });
});
