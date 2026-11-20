import { describe, expect, it } from 'vitest';
import { FEED_LIST_MAX, FEED_SOURCE_SLUG_MAX } from './feedLimits.js';
import { PreferencesSchema } from './preferences.js';

const empty = { tags: [], sources: [] };

describe('PreferencesSchema', () => {
  it('accepts an empty set and a set with tags and sources in both modes', () => {
    expect(PreferencesSchema.safeParse({ follow: empty, mute: empty }).success).toBe(true);
    const preferences = {
      follow: { tags: ['react', 'rust'], sources: ['rss-react-blog'] },
      mute: { tags: ['career'], sources: ['hn'] },
    };
    expect(PreferencesSchema.parse(preferences)).toEqual(preferences);
  });

  it('rejects the same value in follow and mute, and points at the muted entry', () => {
    const result = PreferencesSchema.safeParse({
      follow: { tags: ['react'], sources: ['hn'] },
      mute: { tags: ['career', 'react'], sources: [] },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([['mute', 'tags', 1]]);
  });

  it('allows one value as a followed tag and a muted source, since they are different kinds', () => {
    const result = PreferencesSchema.safeParse({
      follow: { tags: ['go'], sources: [] },
      mute: { tags: [], sources: ['go'] },
    });
    expect(result.success).toBe(true);
  });

  it('caps each list at FEED_LIST_MAX', () => {
    const sources = Array.from({ length: FEED_LIST_MAX + 1 }, (_, index) => `s${index}`);
    const tooMany = { follow: { tags: [], sources }, mute: empty };
    expect(PreferencesSchema.safeParse(tooMany).success).toBe(false);
    const atCap = { follow: { tags: [], sources: sources.slice(0, FEED_LIST_MAX) }, mute: empty };
    expect(PreferencesSchema.safeParse(atCap).success).toBe(true);
  });

  it('format-checks source slugs and rejects unknown tags', () => {
    const badSlugs = ['hn,devto', 'HN', 'rss blog', '-hn', 'a'.repeat(FEED_SOURCE_SLUG_MAX + 1)];
    for (const slug of badSlugs) {
      const parsed = PreferencesSchema.safeParse({
        follow: empty,
        mute: { tags: [], sources: [slug] },
      });
      expect(parsed.success, slug).toBe(false);
    }
    const unknownTag = { follow: { tags: ['not-a-tag'], sources: [] }, mute: empty };
    expect(PreferencesSchema.safeParse(unknownTag).success).toBe(false);
  });
});
