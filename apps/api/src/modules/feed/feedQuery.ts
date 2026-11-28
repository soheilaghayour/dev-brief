import { sortedSet } from '../../common/feed-filters/feedFilters.js';
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

/** The query the feed runs: Latest orders by date, never by rankScore, so its boost params are dropped. */
export function effectiveFeedQuery(query: FeedQuery): FeedQuery {
  return query.sort === 'top' ? query : { ...query, boostTags: undefined, boostSources: undefined };
}

/** The cache key: equal queries map to one key whatever the order or repeats of their list values. */
export function feedCacheKey(query: FeedQuery) {
  return JSON.stringify([
    'feed',
    query.sort,
    sortedSet(query.tags),
    sortedSet(query.kinds),
    sortedSet(query.sources),
    query.q ?? null,
    sortedSet(query.excludeTags),
    sortedSet(query.excludeSources),
    sortedSet(query.boostTags),
    sortedSet(query.boostSources),
    query.cursor ?? null,
    query.limit,
  ]);
}

// Words that name no subject of a question; with `week` or `team` matching, a "this week" question would match every story.
const QUESTION_FILLER = new Set([
  ...['week', 'day', 'days', 'today', 'new', 'latest', 'last', 'few', 'right', 'now'],
  ...['people', 'say', 'saying', 'developer', 'developers', 'team', 'teams', 'use', 'using'],
  ...['choose', 'vs', 'versus', 'what', 'which', 'how', 'why', 'this', 'still', 'worth'],
  ...['notable', 'biggest', 'whether', 'discussing'],
  // The English text search ignores these, so counting them would raise the matched-keyword floor for nothing.
  ...['about', 'and', 'any', 'are', 'did', 'does', 'for', 'from', 'has', 'have', 'into', 'its'],
  ...['not', 'over', 'the', 'their', 'them', 'there', 'they', 'was', 'were', 'when', 'with', 'you'],
  ...['can', 'could', 'would', 'should', 'will', 'than', 'then', 'that', 'these', 'those', 'your'],
  ...['is', 'it', 'be', 'by', 'at', 'in', 'on', 'of', 'or', 'to', 'we', 'my', 'our', 'an', 'as'],
  ...['if', 'no', 'so', 'do', 'but', 'while'],
]);

/** The subject words of a question: lowercase letters and digits runs of two or more, minus the filler words. */
export function questionKeywords(question: string) {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(words.filter((word) => !QUESTION_FILLER.has(word)))];
}
