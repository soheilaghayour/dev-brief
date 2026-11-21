import { setTimeout as sleep } from 'node:timers/promises';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApiException } from '../errors/api.exception.js';

/** With the user's id hash, keys the advisory lock; a class of its own, apart from the preference and spend locks. */
const COLLECTION_LOCK_CLASS = 8_113_004;
const LOCK_TRIES = 3;
const LOCK_RETRY_DELAY_MS = 50;

/**
 * Holds the user's collection write lock until the transaction ends, so positions and limits are decided on a stable set.
 * The lock is tried, not awaited: a blocked waiter would hold a pool connection, and enough of them would starve every other request.
 * After a few short retries the call answers a retryable 409.
 */
export async function lockCollectionWrites(tx: Prisma.TransactionClient, userId: string) {
  for (let attempt = 1; attempt <= LOCK_TRIES; attempt += 1) {
    // Raw SQL because Prisma has no advisory-lock API.
    const [row] = await tx.$queryRaw<
      { acquired: boolean }[]
    >`SELECT pg_try_advisory_xact_lock(${COLLECTION_LOCK_CLASS}::int, hashtext(${userId})) AS acquired`;
    if (row?.acquired) return;
    if (attempt < LOCK_TRIES) await sleep(LOCK_RETRY_DELAY_MS);
  }
  throw new ApiException('CONFLICT', 'Your collections are being changed elsewhere. Try again.');
}
