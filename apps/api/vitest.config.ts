import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Same precedence as the dotenv-cli scripts: real env vars (CI), then the root .env, then .env.example.
const readEnvFile = (name: string) => {
  const file = new URL(`../../${name}`, import.meta.url);
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
};
const testEnv = { ...readEnvFile('.env.example'), ...readEnvFile('.env'), ...process.env };
// test.env below reaches only the workers; globalSetup (migrations) runs here and reads process.env.
process.env.DATABASE_URL = testEnv.DATABASE_URL_TEST;

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
    alias: [
      // Tests read the shared source (the entry its package.json `types` names), so they need no prior build; subpaths resolve through its exports.
      {
        find: /^@devbrief\/shared$/,
        replacement: fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
      },
    ],
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
