import { execFileSync } from 'node:child_process';
import pg from 'pg';

/** Vitest global setup: creates the test database if missing, then applies every migration once per run. */
export default async function migrateDatabase() {
  // vitest.config.ts sets DATABASE_URL to DATABASE_URL_TEST in this process; db:deploy inherits it.
  const url = new URL(process.env.DATABASE_URL ?? '');
  const database = url.pathname.slice(1);
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      database,
    ]);
    if (rowCount === 0) await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }

  execFileSync('pnpm', ['run', 'db:deploy'], {
    cwd: new URL('../..', import.meta.url),
    stdio: 'inherit',
  });
}
