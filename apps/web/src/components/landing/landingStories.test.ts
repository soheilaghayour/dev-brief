import { StoryCardSchema, type StoryCard } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import fixture from '@/content/landing-fixture.json';
import {
  PREVIEW_POOL_MAX,
  fixtureStories,
  formatCounts,
  selectRecentStories,
  type FixtureStory,
} from './landingStories';

const NOW = new Date('2026-11-20T12:00:00Z');

function story(id: string, hoursAgo: number): StoryCard {
  return {
    id,
    title: id,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    excerpt: null,
    author: null,
    publishedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
    tags: [],
    readingTimeMinutes: null,
    sources: [
      {
        kind: 'hn',
        slug: 'hn',
        name: 'Hacker News',
        itemUrl: 'https://news.ycombinator.com/item?id=1',
        points: 1,
        comments: 1,
        reactions: null,
      },
    ],
    rankScore: 1,
  };
}

describe('selectRecentStories', () => {
  it('AC-L1 keeps stories from the last 24 h in rank order and drops older ones', () => {
    const stories = [story('a', 30), story('b', 23), story('c', 1), story('d', 25)];
    expect(selectRecentStories(stories, NOW).map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('keeps at most the pool size', () => {
    const stories = Array.from({ length: 50 }, (_, index) => story(`s${index}`, 1));
    expect(selectRecentStories(stories, NOW)).toHaveLength(PREVIEW_POOL_MAX);
  });
});

describe('fixtureStories', () => {
  it('AC-L2 turns the committed fixture into valid cards dated within the last 24 h', () => {
    const cards = fixtureStories(fixture.items as FixtureStory[], NOW);
    for (const card of cards) StoryCardSchema.parse(card);
    expect(selectRecentStories(cards, NOW)).toHaveLength(cards.length);
    expect(cards.length).toBeGreaterThanOrEqual(6);
  });
});

describe('formatCounts', () => {
  it('formats the hero counts with thousands separators and singular forms', () => {
    expect(formatCounts(312, 12)).toBe('312 stories today · 12 sources');
    expect(formatCounts(1204, 1)).toBe('1,204 stories today · 1 source');
    expect(formatCounts(1, 2)).toBe('1 story today · 2 sources');
  });
});
