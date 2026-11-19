import { Inject, Injectable, Logger } from '@nestjs/common';
import pg from 'pg';
import { ENV, type Env } from '../../common/env/env.module.js';

export const INGEST_LOCK_KEY = 8_113_001;

/** The cross-instance ingestion lock: a Postgres advisory lock held on a connection of its own. */
@Injectable()
export class IngestionLock {
  private readonly logger = new Logger(IngestionLock.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Returns a release function, or null when another instance holds the lock. */
  async tryAcquire() {
    // A session-level lock must be released on the connection that took it, which a pooled client can't promise.
    const client = new pg.Client({ connectionString: this.env.DATABASE_URL });
    // An idle client emits 'error' when its connection drops; unhandled, that would kill the process.
    client.on('error', (error) =>
      this.logger.warn(`Ingestion lock connection lost: ${error.message}`),
    );
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
      } catch (error) {
        // The session is gone, and a session-level lock goes with it.
        this.logger.warn(`Ingestion unlock failed: ${String(error)}`);
      } finally {
        await client.end().catch(() => undefined);
      }
    };
  }
}
