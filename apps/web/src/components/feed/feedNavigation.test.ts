// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { FeedPage, SourceRef, StoryCard } from '@devbrief/shared';
import {
  discussionUrl,
  flattenPages,
  focusableId,
  isEnterOnInteractiveElement,
  moveActiveId,
} from './feedNavigation';

function source(kind: SourceRef['kind'], itemUrl: string): SourceRef {
  return {
    kind,
    slug: kind,
    name: kind,
    itemUrl,
    points: null,
    comments: null,
    reactions: null,
  };
}

function story(id: string, sources: SourceRef[] = [source('rss', 'https://blog.test/post')]) {
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
    sources,
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

describe('moveActiveId', () => {
  const stories = [story('a'), story('b'), story('c')];

  it('AC-1.3.8 j and k step through the list and stop at both ends', () => {
    expect(moveActiveId(stories, 'a', 1)).toBe('b');
    expect(moveActiveId(stories, 'c', 1)).toBe('c');
    expect(moveActiveId(stories, 'b', -1)).toBe('a');
    expect(moveActiveId(stories, 'a', -1)).toBe('a');
  });

  it('AC-1.3.8 starts on the first card when none is active or the active one is gone', () => {
    expect(moveActiveId(stories, null, 1)).toBe('a');
    expect(moveActiveId(stories, null, -1)).toBe('a');
    expect(moveActiveId(stories, 'gone', 1)).toBe('a');
  });

  it('returns nothing for an empty list', () => {
    expect(moveActiveId([], null, 1)).toBeNull();
  });
});

describe('discussionUrl', () => {
  it('AC-1.3.8 picks the first Hacker News or Dev.to item, skipping blogs', () => {
    const card = story('a', [
      source('rss', 'https://blog.test/post'),
      source('devto', 'https://dev.to/post'),
      source('hn', 'https://news.ycombinator.com/item?id=1'),
    ]);
    expect(discussionUrl(card)).toBe('https://dev.to/post');
  });

  it('is null for a story only blogs cover', () => {
    expect(discussionUrl(story('a'))).toBeNull();
  });
});

describe('focusableId', () => {
  it('AC-1.3.13 accepts a story on the first page', () => {
    expect(focusableId('b', page('a', 'b'))).toBe('b');
  });

  it('AC-1.3.13 ignores a story that is not on the first page or a missing param', () => {
    expect(focusableId('z', page('a', 'b'))).toBeNull();
    expect(focusableId(null, page('a'))).toBeNull();
    expect(focusableId('a', undefined)).toBeNull();
  });
});

describe('isEnterOnInteractiveElement', () => {
  it('is true for Enter on a link or a button inside it', () => {
    const link = document.createElement('a');
    const icon = document.createElement('span');
    link.append(icon);
    expect(isEnterOnInteractiveElement('Enter', link)).toBe(true);
    expect(isEnterOnInteractiveElement('Enter', icon)).toBe(true);
  });

  it('is false on the page body or for other keys', () => {
    expect(isEnterOnInteractiveElement('Enter', document.body)).toBe(false);
    expect(isEnterOnInteractiveElement('o', document.createElement('a'))).toBe(false);
  });
});
