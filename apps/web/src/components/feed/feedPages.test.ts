import { describe, expect, it } from 'vitest';
import type { FeedPage, StoryCard } from '@devbrief/shared';
import { flattenPages } from './feedPages';

function story(id: string) {
  return {
    id,
    title: id,
    url: 'https://blog.test/post',
    domain: 'blog.test',
    excerpt: null,
    author: null,
    publishedAt: '2026-11-19T10:00:00.000Z',
    tags: [],
    readingTimeMinutes: null,
    sources: [
      {
        kind: 'rss',
        slug: 'rss',
        name: 'rss',
        itemUrl: 'https://blog.test/post',
        points: null,
        comments: null,
        reactions: null,
        stars: null,
      },
    ],
    rankScore: 1,
  } satisfies StoryCard;
}

const page = (...ids: string[]): FeedPage => ({
  items: ids.map((id) => story(id)),
  nextCursor: null,
});

describe('flattenPages', () => {
  it('AC-1.3.5 keeps the first copy of a story that appears on two pages', () => {
    const ids = flattenPages([page('a', 'b'), page('b', 'c')]).map(({ id }) => id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});
