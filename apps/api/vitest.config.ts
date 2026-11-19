import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Defaults come from the root .env.example (the one home of local values); real env vars win, as in CI.
const defaultEnv = parseEnv(readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'));
const testEnv = { ...defaultEnv, ...process.env };

// SWC emits the decorator metadata Nest's dependency injection reads; esbuild does not.
export default defineConfig({
  test: {
    name: 'api',
    // Test files share one database and truncate it, so they run one after another.
    fileParallelism: false,
    // Tests and migrations both use DATABASE_URL_TEST, so a local run never touches the dev database.
    env: { ...testEnv, DATABASE_URL: testEnv.DATABASE_URL_TEST },
    globalSetup: ['./test/integration/migrateDatabase.ts'],
  },
  resolve: {
    alias: {
      // Tests run against the shared source, so they need no prior build of the package.
      '@devbrief/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
