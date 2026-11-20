import { encodeCursor, InvalidCursorError, type FeedQuery } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { feedCacheKey, parseKeyset } from './feedQuery.js';

const baseQuery: FeedQuery = { sort: 'top', limit: 20 };

describe('parseKeyset', () => {
  it('reads a numeric rank key for top', () => {
    expect(parseKeyset(encodeCursor('top', 1.5, 'a'), 'top')).toEqual({ sortKey: 1.5, id: 'a' });
  });

  it('reads a date key for latest', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    expect(parseKeyset(encodeCursor('latest', iso, 'a'), 'latest')).toEqual({
      sortKey: new Date(iso),
      id: 'a',
    });
  });

  it('rejects a key of the wrong type for the sort', () => {
    expect(() => parseKeyset(encodeCursor('top', 'x', 'a'), 'top')).toThrow(InvalidCursorError);
    expect(() => parseKeyset(encodeCursor('latest', 'not a date', 'a'), 'latest')).toThrow(
      InvalidCursorError,
    );
    expect(() => parseKeyset(encodeCursor('latest', 5, 'a'), 'latest')).toThrow(InvalidCursorError);
  });

  it('rejects a cursor issued for the other sort', () => {
    expect(() => parseKeyset(encodeCursor('latest', '2026-01-01', 'a'), 'top')).toThrow(
      InvalidCursorError,
    );
  });
});

describe('feedCacheKey', () => {
  it('ignores the order of facet values', () => {
    expect(feedCacheKey({ ...baseQuery, tags: ['react', 'rust'] })).toBe(
      feedCacheKey({ ...baseQuery, tags: ['rust', 'react'] }),
    );
  });

  it('differs when any part of the query differs', () => {
    expect(feedCacheKey(baseQuery)).not.toBe(feedCacheKey({ ...baseQuery, sort: 'latest' }));
    expect(feedCacheKey(baseQuery)).not.toBe(feedCacheKey({ ...baseQuery, q: 'bun' }));
  });

  it('normalises the personalisation params: order and repeats do not matter', () => {
    expect(
      feedCacheKey({
        ...baseQuery,
        excludeTags: ['career', 'go', 'career'],
        excludeSources: ['hn', 'devto'],
        boostTags: ['rust', 'react'],
        boostSources: ['rss-b', 'rss-a'],
      }),
    ).toBe(
      feedCacheKey({
        ...baseQuery,
        excludeTags: ['go', 'career'],
        excludeSources: ['devto', 'hn'],
        boostTags: ['react', 'rust'],
        boostSources: ['rss-a', 'rss-b', 'rss-a'],
      }),
    );
    expect(feedCacheKey({ ...baseQuery, boostTags: [] })).toBe(feedCacheKey(baseQuery));
  });

  it('keeps each personalisation param apart: the same value in another param is another key', () => {
    const keys = new Set([
      feedCacheKey(baseQuery),
      feedCacheKey({ ...baseQuery, tags: ['rust'] }),
      feedCacheKey({ ...baseQuery, excludeTags: ['rust'] }),
      feedCacheKey({ ...baseQuery, boostTags: ['rust'] }),
      feedCacheKey({ ...baseQuery, sources: ['hn'] }),
      feedCacheKey({ ...baseQuery, excludeSources: ['hn'] }),
      feedCacheKey({ ...baseQuery, boostSources: ['hn'] }),
    ]);
    expect(keys.size).toBe(7);
  });

  it('ignores the boost params on Latest, which does not boost, but not on Top', () => {
    const boosts = { boostTags: ['rust' as const], boostSources: ['hn'] };
    expect(feedCacheKey({ ...baseQuery, sort: 'latest', ...boosts })).toBe(
      feedCacheKey({ ...baseQuery, sort: 'latest' }),
    );
    expect(feedCacheKey({ ...baseQuery, ...boosts })).not.toBe(feedCacheKey(baseQuery));
  });
});
