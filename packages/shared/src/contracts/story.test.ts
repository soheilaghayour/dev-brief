import { describe, expect, it } from 'vitest';
import { MergeRequestSchema } from './saves.js';
import { StoryCardSchema, StoryLookupRequestSchema } from './story.js';

const cuid = 'cm0abcdefghijklmnopqrstuv';

describe('story id validation', () => {
  it('accepts cuids and rejects other strings in lookup ids', () => {
    expect(StoryLookupRequestSchema.safeParse({ ids: [cuid] }).success).toBe(true);
    expect(StoryLookupRequestSchema.safeParse({ ids: ['x'.repeat(900)] }).success).toBe(false);
    expect(StoryLookupRequestSchema.safeParse({ ids: ['a'] }).success).toBe(false);
  });

  it('rejects a merge save with a malformed story id', () => {
    const savedAt = '2026-01-01T00:00:00.000Z';
    expect(
      MergeRequestSchema.safeParse({ version: 1, saves: [{ storyId: cuid, savedAt }] }).success,
    ).toBe(true);
    expect(
      MergeRequestSchema.safeParse({ version: 1, saves: [{ storyId: 'nope', savedAt }] }).success,
    ).toBe(false);
  });
});

describe('card cluster', () => {
  const card = {
    id: 'a',
    title: 'T',
    url: 'https://example.com/a',
    domain: 'example.com',
    excerpt: null,
    author: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    tags: [],
    readingTimeMinutes: null,
    sources: [
      {
        kind: 'hn',
        slug: 'hn',
        name: 'HN',
        itemUrl: 'https://news.ycombinator.com/item?id=1',
        points: null,
        comments: null,
        reactions: null,
        stars: null,
      },
    ],
    rankScore: 1,
  };

  it('AC-2.1.4 accepts a card without cluster and rejects a cluster of fewer than 2 members', () => {
    expect(StoryCardSchema.safeParse(card).success).toBe(true);
    const cluster = { id: 'c', memberCount: 2, sources: card.sources };
    expect(StoryCardSchema.safeParse({ ...card, cluster }).success).toBe(true);
    expect(
      StoryCardSchema.safeParse({ ...card, cluster: { ...cluster, memberCount: 1 } }).success,
    ).toBe(false);
  });
});
