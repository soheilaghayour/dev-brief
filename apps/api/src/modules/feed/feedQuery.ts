import { decodeCursor, InvalidCursorError, type FeedQuery } from '@devbrief/shared';

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

// Sorted and deduplicated: the feed query treats every list as a set.
const asSet = (values: readonly string[] = []) => [...new Set(values)].sort();

/** The query the feed runs: Latest orders by date, never by rankScore, so its boost params are dropped. */
export function effectiveFeedQuery(query: FeedQuery): FeedQuery {
  return query.sort === 'top' ? query : { ...query, boostTags: undefined, boostSources: undefined };
}

/** The cache key: equal queries map to one key whatever the order or repeats of their list values. */
export function feedCacheKey(query: FeedQuery) {
  return JSON.stringify([
    'feed',
    query.sort,
    asSet(query.tags),
    asSet(query.kinds),
    asSet(query.sources),
    query.q ?? null,
    asSet(query.excludeTags),
    asSet(query.excludeSources),
    asSet(query.boostTags),
    asSet(query.boostSources),
    query.cursor ?? null,
    query.limit,
  ]);
}
