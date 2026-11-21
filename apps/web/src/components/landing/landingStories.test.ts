import { StoryCardSchema, type StoryCard } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import fixture from '@/content/landing-fixture.json';
import {
  PREVIEW_POOL_MAX,
  fixtureStories,
  formatCounts,
  selectRecentStories,
  toPreviewStory,
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
        stars: null,
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

// The fixture holds only what the preview's cards render.
const FixtureCardSchema = StoryCardSchema.omit({
  excerpt: true,
  author: true,
  rankScore: true,
  canSummarize: true,
}).strict();

describe('fixtureStories', () => {
  it('AC-L2 turns the committed fixture into valid cards dated within the last 24 h', () => {
    const cards = fixtureStories(fixture.items as FixtureStory[], NOW);
    for (const card of cards) FixtureCardSchema.parse(card);
    expect(selectRecentStories(cards, NOW)).toHaveLength(cards.length);
  });

  it('AC-L13 fills a full window: 30 stories from the enabled sources, Rust stories and one cluster card with a summary line', () => {
    const cards = fixtureStories(fixture.items as FixtureStory[], NOW);
    expect(cards).toHaveLength(PREVIEW_POOL_MAX);
    expect(cards.filter((card) => card.tags.includes('rust')).length).toBeGreaterThan(0);
    const kinds = new Set(cards.flatMap((card) => card.sources.map((source) => source.kind)));
    expect([...kinds].sort()).toEqual(['devto', 'github', 'hn']);
    const clustered = cards.filter((card) => card.cluster);
    expect(clustered).toHaveLength(1);
    expect(clustered[0]!.summaryLine).toBeTruthy();
  });
});

describe('toPreviewStory', () => {
  const live: StoryCard = {
    ...story('live', 1),
    excerpt: 'A long excerpt the preview never shows.',
    author: 'someone',
    canSummarize: true,
    hasSummary: true,
    summaryLine: 'The first TL;DR point.',
    cluster: { id: 'c1', memberCount: 2, sources: story('live', 1).sources },
  };
  const ALL_ON = { clusters: true, summaries: true, copilot: true, collections: true };
  const ALL_OFF = { clusters: false, summaries: false, copilot: false, collections: false };

  it('drops the fields the preview cards do not render, before they reach the client island', () => {
    const preview = toPreviewStory(live, ALL_ON);
    for (const field of ['excerpt', 'author', 'rankScore', 'canSummarize'])
      expect(preview).not.toHaveProperty(field);
  });

  it('AC-L14 carries the cluster and the summary line through while their flags are on', () => {
    const preview = toPreviewStory(live, ALL_ON);
    expect(preview.cluster).toEqual(live.cluster);
    expect(preview.summaryLine).toBe('The first TL;DR point.');
    expect(preview.hasSummary).toBe(true);
  });

  it('AC-L7 drops the cluster and the summary fields while their flags are off', () => {
    const preview = toPreviewStory(live, ALL_OFF);
    expect(preview).not.toHaveProperty('cluster');
    expect(preview).not.toHaveProperty('summaryLine');
    expect(preview).not.toHaveProperty('hasSummary');
  });
});

describe('formatCounts', () => {
  it('formats the hero counts with thousands separators and singular forms', () => {
    expect(formatCounts(312, 12)).toBe('312 stories today · 12 sources');
    expect(formatCounts(1204, 1)).toBe('1,204 stories today · 1 source');
    expect(formatCounts(1, 2)).toBe('1 story today · 2 sources');
  });
});
