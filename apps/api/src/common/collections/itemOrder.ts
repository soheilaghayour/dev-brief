import type { Prisma } from '../../generated/prisma/client.js';
import { clampPosition, positionShift } from './positionShift.js';

// `updateMany` throughout: it shifts positions in one statement and leaves `updatedAt` alone on rows that merely moved.

/** Closes the gap a removed item left at `removedPosition`. */
export async function closeItemGap(
  tx: Prisma.TransactionClient,
  collectionId: string,
  removedPosition: number,
) {
  await tx.collectionItem.updateMany({
    where: { collectionId, position: { gt: removedPosition } },
    data: { position: { decrement: 1 } },
  });
}

/** Moves one item of a dense order of `count` items from `from` to `requested` (clamped): one range shift plus one update. */
export async function moveItem(
  tx: Prisma.TransactionClient,
  { collectionId, storyId }: { collectionId: string; storyId: string },
  from: number,
  requested: number,
  count: number,
) {
  const to = clampPosition(requested, count);
  const shift = positionShift(from, to);
  if (!shift) return;
  await tx.collectionItem.updateMany({
    where: { collectionId, position: shift.range },
    data: { position: shift.by === 1 ? { increment: 1 } : { decrement: 1 } },
  });
  await tx.collectionItem.updateMany({ where: { collectionId, storyId }, data: { position: to } });
}
