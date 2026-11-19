import { decodeCursor, InvalidCursorError, type FeedQuery } from '@devbrief/shared';

export const TOP_WINDOW_DAYS = 7;

export type Keyset = { sortKey: number | Date; id: string };

/** Decodes a feed cursor into the typed keyset of its sort; throws InvalidCursorError when the key has the wrong type. */
export function parseKeyset(cursor: string, sort: FeedQuery['sort']): Keyset {
  const [sortKey, id] = decodeCursor(cursor, sort).k;
  if (sort === 'top') {
    if (typeof sortKey !== 'number') throw new InvalidCursorError();
    return { sortKey, id };
  }
  const publishedAt = new Date(sortKey);
  if (typeof sortKey !== 'string' || Number.isNaN(publishedAt.getTime())) {
    throw new InvalidCursorError();
  }
  return { sortKey: publishedAt, id };
}

/** The cache key: equal queries map to one key whatever the order of their facet values. */
export function feedCacheKey(query: FeedQuery) {
  return JSON.stringify([
    'feed',
    query.sort,
    [...(query.tags ?? [])].sort(),
    [...(query.kinds ?? [])].sort(),
    [...(query.sources ?? [])].sort(),
    query.q ?? null,
    query.cursor ?? null,
    query.limit,
  ]);
}

/** The oldest `publishedAt` the Top sort shows. */
export function topWindowStart(now: Date) {
  return new Date(now.getTime() - TOP_WINDOW_DAYS * 86_400_000);
}
