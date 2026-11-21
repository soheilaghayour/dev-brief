import type { Prisma } from '../../generated/prisma/client.js';

/** With the user's id hash, keys the advisory lock; a class of its own, apart from the preference and spend locks. */
const COLLECTION_LOCK_CLASS = 8_113_004;

/** Holds the user's collection write lock until the transaction ends, so positions and limits are decided on a stable set. */
export async function lockCollectionWrites(tx: Prisma.TransactionClient, userId: string) {
  // Raw SQL because Prisma has no advisory-lock API; $executeRaw, since $queryRaw can't read the void result.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${COLLECTION_LOCK_CLASS}::int, hashtext(${userId}))`;
}
