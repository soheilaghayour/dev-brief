import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['apps/*', 'packages/*'],
    // Coverage is a root-level option; it is on for every run so the threshold fails CI.
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['packages/shared/src/core/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
      thresholds: { lines: 90 },
    },
  },
});
