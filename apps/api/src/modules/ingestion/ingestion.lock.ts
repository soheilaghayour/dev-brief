import { Injectable } from '@nestjs/common';
import pg from 'pg';
import { loadEnv } from '../../env.js';

const INGEST_LOCK_KEY = 8_113_001;

/** The cross-instance ingestion lock: a Postgres advisory lock held on a connection of its own. */
@Injectable()
export class IngestionLock {
  /** Returns a release function, or null when another instance holds the lock. */
  async tryAcquire() {
    // A session-level lock must be released on the connection that took it, which a pooled client can't promise.
    const client = new pg.Client({ connectionString: loadEnv().DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [INGEST_LOCK_KEY],
      );
      if (!rows[0]?.acquired) {
        await client.end();
        return null;
      }
    } catch (error) {
      await client.end();
      throw error;
    }
    return async () => {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [INGEST_LOCK_KEY]);
      } finally {
        await client.end();
      }
    };
  }
}
