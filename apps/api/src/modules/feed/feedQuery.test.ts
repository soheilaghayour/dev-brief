import { encodeCursor, InvalidCursorError, type FeedQuery } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { feedCacheKey, parseKeyset, topWindowStart } from './feedQuery.js';

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
});

describe('topWindowStart', () => {
  it('is seven days before now', () => {
    expect(topWindowStart(new Date('2026-06-08T00:00:00Z')).toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });
});
