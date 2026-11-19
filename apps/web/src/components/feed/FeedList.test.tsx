import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedPage, StoryCard } from '@devbrief/shared';
import { FeedList } from './FeedList';

const query = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));

vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: () => query.current }));
vi.mock('@/components/saves/useSaves', () => ({
  useSaves: () => ({ isSaved: () => false, toggle: () => {} }),
}));
vi.mock('./feedQueries', () => ({ feedQueryOptions: () => ({}) }));
vi.mock('@/lib/hotkeys/HotkeysProvider', () => ({ useShortcut: () => {} }));
vi.mock('./useFeedFilters', () => ({
  useFeedFilters: () => ({
    filters: { sort: 'top', tags: ['react'], kinds: [], sources: [], q: '' },
    focus: null,
    toggleSort: () => {},
    clearAll: () => {},
  }),
}));

function story(id: string): StoryCard {
  return {
    id,
    title: `Story ${id}`,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    excerpt: null,
    author: null,
    publishedAt: '2026-11-19T10:00:00.000Z',
    tags: [],
    readingTimeMinutes: null,
    rankScore: 1,
    sources: [
      {
        kind: 'rss',
        slug: 'blog',
        name: 'Blog',
        itemUrl: `https://example.com/${id}`,
        points: null,
        comments: null,
        reactions: null,
      },
    ],
  };
}

const page = (...ids: string[]): FeedPage => ({ items: ids.map(story), nextCursor: null });

function mockQuery(overrides: Record<string, unknown>) {
  query.current = {
    isPending: false,
    data: { pages: [page('a')], pageParams: [undefined] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    fetchNextPage: () => {},
    refetch: () => {},
    ...overrides,
  };
}

beforeEach(() => mockQuery({}));

describe('FeedList', () => {
  it('AC-1.3.9 shows skeleton rows while the first page loads', () => {
    mockQuery({ isPending: true, data: undefined });
    expect(renderToStaticMarkup(<FeedList />)).toContain('Loading stories');
  });

  it('AC-1.3.9 shows the empty state with Clear filters while a filter is active', () => {
    mockQuery({ data: { pages: [page()], pageParams: [undefined] } });
    const html = renderToStaticMarkup(<FeedList />);
    expect(html).toContain('No stories match');
    expect(html).toContain('Clear filters');
  });

  it('AC-1.3.9 shows an inline error with Retry when the first page fails', () => {
    mockQuery({ data: undefined });
    const html = renderToStaticMarkup(<FeedList />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Retry');
  });

  it('AC-1.3.9 keeps the existing cards when the next page fails', () => {
    mockQuery({
      data: { pages: [page('a', 'b')], pageParams: [undefined] },
      hasNextPage: true,
      isFetchNextPageError: true,
    });
    const html = renderToStaticMarkup(<FeedList />);
    expect(html).toContain('Story a');
    expect(html).toContain('Story b');
    expect(html).toContain('Couldn&#x27;t load more stories.');
  });

  it('AC-1.3.5 renders a story that appears on two pages once', () => {
    mockQuery({ data: { pages: [page('a', 'b'), page('b', 'c')], pageParams: [undefined, 'x'] } });
    const html = renderToStaticMarkup(<FeedList />);
    expect(html.match(/data-story-id="b"/g)).toHaveLength(1);
    expect(html.match(/data-story-id=/g)).toHaveLength(3);
  });
});
