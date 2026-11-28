import type { TagSlug } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { PREVIEW_TAGS, storyHref, visibleStories } from './previewLogic';

function story(id: string, tags: TagSlug[]) {
  return { id, tags };
}

describe('visibleStories', () => {
  const pool = Array.from({ length: 30 }, (_, index) =>
    story(`s${index}`, index % 2 === 0 ? ['react'] : ['databases', 'react']),
  );

  it('AC-L13 shows every story of the pool for All, up to the 30 embedded', () => {
    expect(visibleStories(pool, 'all').map((s) => s.id)).toEqual(pool.map((s) => s.id));
  });

  it('AC-L13 filters the whole pool by the chosen tag, in rank order', () => {
    expect(visibleStories(pool, 'databases')).toHaveLength(15);
    expect(
      visibleStories(pool, 'databases')
        .slice(0, 3)
        .map((s) => s.id),
    ).toEqual(['s1', 's3', 's5']);
    expect(visibleStories(pool, 'rust')).toEqual([]);
  });
});

describe('PREVIEW_TAGS', () => {
  it('AC-L13 lists the six chips in order', () => {
    expect(PREVIEW_TAGS).toEqual(['all', 'react', 'rust', 'ai-llms', 'typescript', 'databases']);
  });
});

describe('storyHref', () => {
  it('AC-L5 opens the story page', () => {
    expect(storyHref('abc123')).toBe('/story/abc123');
  });

  it('AC-L2 opens the feed for a sample story, which has no story page', () => {
    expect(storyHref('sample-7')).toBe('/feed');
  });
});
