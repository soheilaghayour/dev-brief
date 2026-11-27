import { TagListQuerySchema } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { tagCountsCacheKey } from './tagCountsKey.js';

const key = (query: Record<string, string>) => tagCountsCacheKey(TagListQuerySchema.parse(query));

describe('tagCountsCacheKey', () => {
  it('AC-1.3.11 gives one key to queries that differ only in list order, repeats, or ignored parameters', () => {
    expect(key({ kinds: 'rss,hn', excludeTags: 'rust,react' })).toBe(
      key({
        kinds: 'hn,rss,hn',
        excludeTags: 'react,rust',
        tags: 'go',
        cursor: 'x',
        limit: '5',
        boostTags: 'react',
        boostSources: 'hn',
      }),
    );
  });

  it('AC-1.3.11 gives different keys to different sorts, searches, kinds, sources and mutes', () => {
    const queries: Record<string, string>[] = [
      {},
      { sort: 'latest' },
      { q: 'rust' },
      { kinds: 'hn' },
      { sources: 'hn' },
      { excludeTags: 'rust' },
      { excludeSources: 'hn' },
    ];
    const keys = queries.map(key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
