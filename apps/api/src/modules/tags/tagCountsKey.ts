import type { TagListQuery } from '@devbrief/shared';
import { sortedSet } from '../../common/feed-filters/feedFilters.js';

/** The cache key of a tag-count query: equal queries share one key whatever the order or repeats of their list values. */
export function tagCountsCacheKey(query: TagListQuery) {
  return JSON.stringify([
    'tags',
    query.sort,
    sortedSet(query.kinds),
    sortedSet(query.sources),
    query.q ?? null,
    sortedSet(query.excludeTags),
    sortedSet(query.excludeSources),
  ]);
}
