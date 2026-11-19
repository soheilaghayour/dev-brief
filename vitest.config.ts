import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
    coverage: {
      provider: 'v8',
      include: ['packages/shared/src/core/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: { lines: 90 },
    },
  },
});
