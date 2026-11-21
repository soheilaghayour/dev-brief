import { describe, expect, it } from 'vitest';
import { toStoryCard, type StoryWithItems } from './storyCard.mapper.js';

const ON = { summaries: true, clusters: true };
const OFF = { summaries: false, clusters: true };

function story(overrides: Partial<StoryWithItems> = {}, comments = 5): StoryWithItems {
  return {
    id: 's1',
    title: 'A story',
    url: 'https://example.com/a',
    domain: 'example.com',
    excerpt: 'An excerpt that must never stand in for a summary',
    author: null,
    publishedAt: new Date('2026-11-20T10:00:00Z'),
    tags: [],
    readingTimeMinutes: null,
    rankScore: 1,
    clusterId: null,
    summary: null,
    items: [
      {
        source: { kind: 'hn', slug: 'hn', name: 'Hacker News' },
        commentsCount: comments,
        discussionUrl: null,
        url: 'https://example.com/a',
        points: 1,
        reactionsCount: null,
        stars: null,
      },
    ],
    ...overrides,
  } as unknown as StoryWithItems;
}

const summary = { tldr: ['First point', 'Second', 'Third'] };

describe('toStoryCard summary fields', () => {
  it('AC-2.3.9 carries the first TL;DR point of a single story with a summary', () => {
    const card = toStoryCard(story({ summary }), ON);
    expect(card).toMatchObject({ hasSummary: true, summaryLine: 'First point' });
  });

  it('AC-2.3.9 gives a story without a summary a null line, not its excerpt', () => {
    const card = toStoryCard(story(), ON);
    expect(card).toMatchObject({ hasSummary: false, summaryLine: null });
  });

  it("AC-2.3.9 gives a cluster member the cluster's line when its own summary is on another member", () => {
    const member = story({ clusterId: 'c1' });
    const info = new Map([['c1', { line: 'From a sibling', canSummarize: true }]]);
    const card = toStoryCard(member, ON, undefined, info);
    expect(card).toMatchObject({ hasSummary: true, summaryLine: 'From a sibling' });
  });

  it('AC-2.3.9 leaves the summary fields out while the summaries flag is off', () => {
    const card = toStoryCard(story({ summary }), OFF);
    expect(card).not.toHaveProperty('hasSummary');
    expect(card).not.toHaveProperty('summaryLine');
    expect(card).not.toHaveProperty('canSummarize');
  });

  it('AC-2.3.12 sets canSummarize from the story items, or from the cluster answer when clustered', () => {
    expect(toStoryCard(story({}, 3), ON).canSummarize).toBe(true);
    expect(toStoryCard(story({}, 2), ON).canSummarize).toBe(false);
    const info = new Map([['c1', { line: null, canSummarize: true }]]);
    expect(toStoryCard(story({ clusterId: 'c1' }, 0), ON, undefined, info).canSummarize).toBe(true);
  });
});
