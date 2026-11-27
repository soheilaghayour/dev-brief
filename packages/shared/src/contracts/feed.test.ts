import { describe, expect, it } from 'vitest';
import { FeedQuerySchema } from './feed.js';

describe('FeedQuerySchema', () => {
  it('AC-1.3.4 accepts q of 1 to 100 characters and rejects an empty, blank or 101-character q', () => {
    expect(FeedQuerySchema.safeParse({ q: '' }).success).toBe(false);
    expect(FeedQuerySchema.safeParse({ q: '   ' }).success).toBe(false);
    expect(FeedQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
    expect(FeedQuerySchema.safeParse({ q: 'a' }).success).toBe(true);
    expect(FeedQuerySchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true);
    expect(FeedQuerySchema.parse({}).q).toBeUndefined();
  });

  it('AC-1.3.4 rejects a q containing a NUL character', () => {
    expect(FeedQuerySchema.safeParse({ q: 'a\u0000b' }).success).toBe(false);
  });

  it('parses tags=react,typescript to an array and rejects an unknown tag', () => {
    expect(FeedQuerySchema.parse({ tags: 'react,typescript' }).tags).toEqual([
      'react',
      'typescript',
    ]);
    expect(FeedQuerySchema.safeParse({ tags: 'react,not-a-tag' }).success).toBe(false);
  });

  it('defaults limit to 20 and sort to top, and caps limit at 50', () => {
    const parsed = FeedQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.sort).toBe('top');
    expect(FeedQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(FeedQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });

  it('caps a csv list at 20 items', () => {
    const sources = Array.from({ length: 21 }, (_, index) => `s${index}`).join(',');
    expect(FeedQuerySchema.safeParse({ sources }).success).toBe(false);
  });

  it('parses the four personalisation params as lists and caps each at 20 items', () => {
    const parsed = FeedQuerySchema.parse({
      excludeTags: 'career',
      excludeSources: 'hn,devto',
      boostTags: 'rust,go',
      boostSources: 'rss-react-blog',
    });
    expect(parsed).toMatchObject({
      excludeTags: ['career'],
      excludeSources: ['hn', 'devto'],
      boostTags: ['rust', 'go'],
      boostSources: ['rss-react-blog'],
    });
    expect(FeedQuerySchema.safeParse({ boostTags: 'rust,not-a-tag' }).success).toBe(false);
    const sources = Array.from({ length: 21 }, (_, index) => `s${index}`).join(',');
    expect(FeedQuerySchema.safeParse({ excludeSources: sources }).success).toBe(false);
  });
});
