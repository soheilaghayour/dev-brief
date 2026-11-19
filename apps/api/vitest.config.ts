import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Defaults come from the root .env.example (the one home of local values); real env vars win, as in CI.
const defaultEnv = parseEnv(readFileSync(new URL('../../.env.example', import.meta.url), 'utf8'));

// SWC emits the decorator metadata Nest's dependency injection reads; esbuild does not.
export default defineConfig({
  test: {
    name: 'api',
    // Test files share one database and truncate it, so they run one after another.
    fileParallelism: false,
    env: { ...defaultEnv, ...process.env },
    globalSetup: ['./test/integration/migrateDatabase.ts'],
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
