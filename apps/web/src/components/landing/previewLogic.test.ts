import type { TagSlug } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_TAGS,
  moveActiveIndex,
  scrollTopToReveal,
  storyHref,
  visibleStories,
} from './previewLogic';

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

describe('storyHref', () => {
  it('AC-L5 opens the story page', () => {
    expect(storyHref('abc123')).toBe('/story/abc123');
  });
});

describe('scrollTopToReveal', () => {
  const frame = { scrollTop: 100, height: 400 };

  it('AC-L13 leaves the frame where it is while the card is fully visible', () => {
    expect(scrollTopToReveal(frame, { top: 100, height: 80 })).toBe(100);
    expect(scrollTopToReveal(frame, { top: 420, height: 80 })).toBe(100);
  });

  it('AC-L13 scrolls down just enough to show a card below the visible part', () => {
    expect(scrollTopToReveal(frame, { top: 460, height: 80 })).toBe(140);
  });

  it('AC-L13 scrolls up to the top of a card above the visible part', () => {
    expect(scrollTopToReveal(frame, { top: 60, height: 80 })).toBe(60);
  });

  it('shows the top of a card taller than the frame', () => {
    expect(scrollTopToReveal(frame, { top: 300, height: 500 })).toBe(300);
  });
});
