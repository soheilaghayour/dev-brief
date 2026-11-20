import type { Prisma } from '../../generated/prisma/client.js';

/** With the user's id hash, keys the advisory lock; a class of its own, apart from the spend ledger's. */
const PREFERENCE_LOCK_CLASS = 8_113_003;

/** Holds the user's preference write lock until the transaction ends, so a PUT and a merge never interleave. */
export async function lockPreferenceWrites(tx: Prisma.TransactionClient, userId: string) {
  // Raw SQL because Prisma has no advisory-lock API; $executeRaw, since $queryRaw can't read the void result.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PREFERENCE_LOCK_CLASS}::int, hashtext(${userId}))`;
}
