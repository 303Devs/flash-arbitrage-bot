/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',
    
    // Test file patterns
    include: [
      'backend/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: [
      'node_modules',
      'dist',
      'contracts'
    ],
    
    // Global test settings
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    
    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'contracts/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        '**/types.ts'
      ]
    },
    
    // Timeouts
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // Watch mode
    watchExclude: [
      'node_modules',
      'dist',
      'contracts'
    ]
  },
  
  // Path resolution to match tsconfig.json
  resolve: {
    alias: {
      '@': resolve(__dirname, './backend'),
      '@config': resolve(__dirname, './backend/config'),
      '@utils': resolve(__dirname, './backend/src/utils')
    }
  }
})