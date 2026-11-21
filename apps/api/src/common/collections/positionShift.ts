/** The range of rows displaced, and the direction, when one row of a dense 0..n-1 order moves from `from` to `to`; null when nothing moves. */
export function positionShift(from: number, to: number) {
  if (to < from) return { range: { gte: to, lte: from - 1 }, by: 1 } as const;
  if (to > from) return { range: { gte: from + 1, lte: to }, by: -1 } as const;
  return null;
}

/** Clamps a requested position to the last slot of an order with `count` rows. */
export function clampPosition(requested: number, count: number) {
  return Math.max(0, Math.min(requested, count - 1));
}
