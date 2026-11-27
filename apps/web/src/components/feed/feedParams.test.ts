import { describe, expect, it } from 'vitest';
import { FEED_QUERY_MAX } from '@devbrief/shared';
import {
  countActiveFilters,
  cutSearch,
  hasActiveFilters,
  loadFeedSearchParams,
  toFeedFilters,
  toFeedParams,
  toggleValue,
} from './feedParams';

import type { FeedFilters } from './feedParams';

const NONE: FeedFilters = { sort: 'top', tags: [], kinds: [], sources: [], q: '' };

describe('loadFeedSearchParams', () => {
  it('AC-1.3.1 reads the defaults from an empty URL', () => {
    expect(loadFeedSearchParams({})).toEqual({ ...NONE, focus: null });
  });

  it('AC-1.3.3 splits comma-separated lists', () => {
    const params = loadFeedSearchParams({ tags: 'react,typescript', kinds: 'hn', sort: 'latest' });
    expect(params).toMatchObject({ tags: ['react', 'typescript'], kinds: ['hn'], sort: 'latest' });
  });

  it('falls back to the default sort for an unknown value', () => {
    expect(loadFeedSearchParams({ sort: 'hot' }).sort).toBe('top');
  });
});

describe('toFeedFilters', () => {
  it('drops tags, kinds and over-long sources the API would reject', () => {
    const filters = toFeedFilters({
      ...NONE,
      tags: ['react', 'cobol', 'react'],
      kinds: ['hn', 'usenet'],
      sources: ['rss-react-blog', 'x'.repeat(65)],
    });
    expect(filters).toMatchObject({
      tags: ['react'],
      kinds: ['hn'],
      sources: ['rss-react-blog'],
    });
  });

  it('caps the search at the contract maximum so the API never answers 400', () => {
    expect(toFeedFilters({ ...NONE, q: 'x'.repeat(150) }).q).toHaveLength(FEED_QUERY_MAX);
  });

  it('trims the search text', () => {
    expect(toFeedFilters({ ...NONE, q: '  bun runtime ' }).q).toBe('bun runtime');
  });
});

describe('toFeedParams', () => {
  it('AC-1.3.4 sends a search of any length from 1 character and omits an empty one', () => {
    expect(toFeedParams({ ...NONE, q: '' })).toEqual({ sort: 'top' });
    expect(toFeedParams({ ...NONE, q: 'b' })).toEqual({ sort: 'top', q: 'b' });
    expect(toFeedParams({ ...NONE, q: 'bu' })).toEqual({ sort: 'top', q: 'bu' });
  });

  it('omits empty facets and keeps the rest', () => {
    expect(toFeedParams({ ...NONE, sort: 'latest', tags: ['react'], kinds: ['hn'] })).toEqual({
      sort: 'latest',
      tags: ['react'],
      kinds: ['hn'],
    });
  });
});

describe('filter counts', () => {
  it('counts chips but not the search text', () => {
    const filters: FeedFilters = { ...NONE, tags: ['react'], kinds: ['hn'], q: 'bun' };
    expect(countActiveFilters(filters)).toBe(2);
  });

  it('treats a search as an active filter', () => {
    expect(hasActiveFilters({ ...NONE, q: 'bun' })).toBe(true);
    expect(hasActiveFilters({ ...NONE })).toBe(false);
  });

  it('AC-1.3.4 treats a 1-character search as active', () => {
    expect(hasActiveFilters({ ...NONE, q: 'b' })).toBe(true);
  });
});

describe('toggleValue', () => {
  it('adds an absent value and removes a present one', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('cutSearch', () => {
  it('AC-1.3.4 drops a high surrogate left at the end by the cut, and keeps whole emoji', () => {
    expect(cutSearch(`${'a'.repeat(FEED_QUERY_MAX - 1)}😀`)).toBe('a'.repeat(FEED_QUERY_MAX - 1));
    expect(cutSearch(`${'a'.repeat(FEED_QUERY_MAX - 2)}😀`)).toBe(
      `${'a'.repeat(FEED_QUERY_MAX - 2)}😀`,
    );
  });
});
