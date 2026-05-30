import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@repo/schema': path.resolve(__dirname, '../../packages/schema/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.medium.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
