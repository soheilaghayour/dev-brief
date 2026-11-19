import { describe, expect, it } from 'vitest';
import { FeedQuerySchema } from './feed.js';

describe('FeedQuerySchema', () => {
  it('rejects q of 1 character and of 101 characters, accepts 2 and 100', () => {
    expect(FeedQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(FeedQuerySchema.safeParse({ q: 'a'.repeat(101) }).success).toBe(false);
    expect(FeedQuerySchema.safeParse({ q: 'ab' }).success).toBe(true);
    expect(FeedQuerySchema.safeParse({ q: 'a'.repeat(100) }).success).toBe(true);
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
});
