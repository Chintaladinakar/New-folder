import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // PGlite starts a full Postgres in WebAssembly for each test file.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
