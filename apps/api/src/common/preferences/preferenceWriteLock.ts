import type { Prisma } from '../../generated/prisma/client.js';

// The two-key form has its own key space, so it never meets single-key locks like the ingestion lock.
const PREFERENCE_LOCK_CLASS = 8_113_002;

/** Holds the user's preference write lock until the transaction ends, so a PUT and a merge never interleave. */
export async function lockPreferenceWrites(tx: Prisma.TransactionClient, userId: string) {
  // Raw SQL because the Prisma client has no advisory locks; $executeRaw, as the function returns void.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PREFERENCE_LOCK_CLASS}::int, hashtext(${userId}))`;
}
