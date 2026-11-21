/** Moves `movedId` to `position` (clamped to the list) in an ordered id list; the new index of each id is its dense position. */
export function moveToPosition(
  orderedIds: readonly string[],
  movedId: string,
  position: number,
): string[] {
  const others = orderedIds.filter((id) => id !== movedId);
  const target = Math.max(0, Math.min(position, others.length));
  return [...others.slice(0, target), movedId, ...others.slice(target)];
}
