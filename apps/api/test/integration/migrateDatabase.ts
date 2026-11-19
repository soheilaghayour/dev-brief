import { execFileSync } from 'node:child_process';

/** Vitest global setup: applies every migration to the test database once per run. */
export default function migrateDatabase() {
  // db:deploy falls back to .env.example, so local runs need no exported DATABASE_URL.
  execFileSync('pnpm', ['run', 'db:deploy'], {
    cwd: new URL('../..', import.meta.url),
    stdio: 'inherit',
  });
}
