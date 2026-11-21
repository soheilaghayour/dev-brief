import type { Prisma } from '../../generated/prisma/client.js';

/** With the cluster id hash, keys the advisory lock; a class of its own, apart from the preference and ledger locks. */
const CLUSTER_SUMMARY_LOCK_CLASS = 8_113_004;

/** Holds the cluster's summary lock until the transaction ends, so two members' requests never both generate. */
export async function lockClusterSummary(tx: Prisma.TransactionClient, clusterId: string) {
  // $executeRaw, since $queryRaw can't read the void result.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CLUSTER_SUMMARY_LOCK_CLASS}::int, hashtext(${clusterId}))`;
}
