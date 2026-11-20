const COMPACT = new Intl.NumberFormat('en', { notation: 'compact' });

/** Formats a count for a badge: `950`, `1.2k`, `15k`, `1.5M`. */
export function formatCompactCount(count: number) {
  return COMPACT.format(count).replace('K', 'k');
}
