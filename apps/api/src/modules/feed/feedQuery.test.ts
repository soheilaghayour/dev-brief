import { encodeCursor, InvalidCursorError, type FeedQuery } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { effectiveFeedQuery, feedCacheKey, parseKeyset, questionKeywords } from './feedQuery.js';

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
});

describe('effectiveFeedQuery', () => {
  const boosts = { boostTags: ['rust' as const], boostSources: ['hn'] };

  it('drops the boost params on Latest, so it shares a cache entry with the unboosted query', () => {
    const latest: FeedQuery = { ...baseQuery, sort: 'latest' };
    expect(feedCacheKey(effectiveFeedQuery({ ...latest, ...boosts }))).toBe(
      feedCacheKey(effectiveFeedQuery(latest)),
    );
  });

  it('keeps them on Top', () => {
    expect(effectiveFeedQuery({ ...baseQuery, ...boosts })).toEqual({ ...baseQuery, ...boosts });
  });
});

describe('questionKeywords', () => {
  it('keeps the subject words of a question, lowercased and once each', () => {
    expect(questionKeywords('What did Cloudflare announce for Workers? Cloudflare!')).toEqual([
      'cloudflare',
      'announce',
      'workers',
    ]);
  });

  it('drops the filler words and one-character words', () => {
    expect(
      questionKeywords("What are developers saying about Rust vs Go this week? It's X"),
    ).toEqual(['rust', 'go']);
  });

  it('is empty for a question of filler only, and carries no tsquery syntax', () => {
    expect(questionKeywords('What is this week?')).toEqual([]);
    expect(questionKeywords("rust' | !go & (c:*) <-> d")).toEqual(['rust', 'go']);
  });
});
