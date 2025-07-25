/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,ts}'],
    exclude: ['node_modules', 'dist'],

    // Global test settings
    globals: true,

    // Basic coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'dist/', '**/*.d.ts', '**/*.config.{js,ts}'],
    },

    // Timeouts for blockchain operations
    testTimeout: 30000,
  },

  // Path resolution to match tsconfig.json
  resolve: {
    alias: {
      '@': resolve(__dirname, './backend'),
      '@config': resolve(__dirname, './backend/config'),
      '@utils': resolve(__dirname, './backend/src/utils'),
      '@arbitrage': resolve(__dirname, './backend/src/arbitrage'),
      '@data': resolve(__dirname, './backend/src/data'),
      '@execution': resolve(__dirname, './backend/src/execution'),
      '@flashloans': resolve(__dirname, './backend/src/flashloans'),
      '@storage': resolve(__dirname, './backend/src/storage'),
    },
  },
});
