import { describe, it, expect } from 'vitest';

describe('Environment Test', () => {
  it('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have node environment', () => {
    expect(typeof process).toBe('object');
    expect(process.version).toBeDefined();
  });

  it('should have correct working directory', () => {
    expect(process.cwd()).toContain('BOT');
  });
});
