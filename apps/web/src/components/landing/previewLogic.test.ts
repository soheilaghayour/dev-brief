import type { StoryCard } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { feedFocusHref, moveActiveIndex, visibleStories } from './previewLogic';

function story(id: string, tags: StoryCard['tags']) {
  return { id, tags } as StoryCard;
}

describe('visibleStories', () => {
  const pool = Array.from({ length: 10 }, (_, index) =>
    story(`s${index}`, index % 2 === 0 ? ['react'] : ['databases', 'react']),
  );

  it('shows the first six stories for All', () => {
    expect(visibleStories(pool, 'all').map((s) => s.id)).toEqual([
      's0',
      's1',
      's2',
      's3',
      's4',
      's5',
    ]);
  });

  it('filters the whole pool by the chosen tag', () => {
    expect(visibleStories(pool, 'databases').map((s) => s.id)).toEqual([
      's1',
      's3',
      's5',
      's7',
      's9',
    ]);
    expect(visibleStories(pool, 'rust' as never)).toEqual([]);
  });
});

describe('moveActiveIndex', () => {
  it('AC-L5 j moves down one card at a time and k moves up, within the list', () => {
    expect(moveActiveIndex(0, 'j', 6)).toBe(1);
    expect(moveActiveIndex(3, 'k', 6)).toBe(2);
    expect(moveActiveIndex(5, 'j', 6)).toBe(5);
    expect(moveActiveIndex(0, 'k', 6)).toBe(0);
    expect(moveActiveIndex(2, 'x', 6)).toBe(2);
  });

  it('keeps index 0 in an empty list', () => {
    expect(moveActiveIndex(0, 'j', 0)).toBe(0);
  });
});

describe('feedFocusHref', () => {
  it('AC-L5 opens the feed with the story focused', () => {
    expect(feedFocusHref('abc123')).toBe('/feed?focus=abc123');
  });
});
