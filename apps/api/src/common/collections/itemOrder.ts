import type { Prisma } from '../../generated/prisma/client.js';

/** Rewrites the item positions of one collection to 0..n-1 in the given story order; unchanged rows are left alone. */
export async function writeItemOrder(
  tx: Prisma.TransactionClient,
  collectionId: string,
  storyIds: string[],
) {
  const rows = await tx.collectionItem.findMany({
    where: { collectionId },
    select: { storyId: true, position: true },
  });
  const current = new Map(rows.map((row) => [row.storyId, row.position]));
  for (const [position, storyId] of storyIds.entries()) {
    if (current.get(storyId) === position) continue;
    await tx.collectionItem.update({
      where: { collectionId_storyId: { collectionId, storyId } },
      data: { position },
      select: { storyId: true },
    });
  }
}

/** Closes the gaps a removed item leaves, keeping the current order. */
export async function renumberItems(tx: Prisma.TransactionClient, collectionId: string) {
  const rows = await tx.collectionItem.findMany({
    where: { collectionId },
    select: { storyId: true },
    orderBy: [{ position: 'asc' }, { storyId: 'asc' }],
  });
  await writeItemOrder(
    tx,
    collectionId,
    rows.map((row) => row.storyId),
  );
}
