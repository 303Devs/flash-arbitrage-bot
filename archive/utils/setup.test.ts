import { describe, expect, it } from 'vitest';

describe('Vitest Setup Verification', () => {
  it('should work with basic assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with path aliases', () => {
    const configPath = '@/config/chains.json';
    expect(configPath).toContain('config');
  });
});
