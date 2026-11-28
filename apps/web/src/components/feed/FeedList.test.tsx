// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedPage, Preferences, StoryCard } from '@devbrief/shared';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';
import { toFeedParams } from '@/lib/guest/preferences';
import { FeedList } from './FeedList';
import { feedQueryOptions } from './feedQueries';

const query = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const features = vi.hoisted(() => ({ q: '' }));
const preferences = vi.hoisted(() => ({ prefs: undefined as Preferences | undefined }));

vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => query.current,
  useQueryClient: () => ({}),
}));
vi.mock('@/components/preferences/usePreferenceState', () => ({
  usePreferenceState: () => {
    const prefs = preferences.prefs ?? EMPTY_PREFERENCES;
    return { prefs, feedParams: toFeedParams(prefs) };
  },
}));
vi.mock('@/components/saves/useSaves', () => ({
  useSaves: () => ({ isSaved: () => false, toggle: () => {} }),
}));
vi.mock('./feedQueries', () => ({
  feedQueryOptions: vi.fn(() => ({})),
  personalisedPlaceholder: () => () => undefined,
}));
vi.mock('@/config/features', () => ({ isFeatureEnabled: () => false }));
vi.mock('./useFeedFilters', () => ({
  useFeedFilters: () => ({
    filters: { sort: 'top', tags: ['react'], kinds: [], sources: [], q: features.q },
    clearAll: () => {},
  }),
}));

function story(id: string, tags: StoryCard['tags'] = []): StoryCard {
  return {
    id,
    title: `Story ${id}`,
    url: `https://example.com/${id}`,
    domain: 'example.com',
    excerpt: null,
    author: null,
    publishedAt: '2026-11-19T10:00:00.000Z',
    tags,
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
        stars: null,
      },
    ],
  };
}

const page = (...ids: string[]): FeedPage => ({
  items: ids.map((id) => story(id)),
  nextCursor: null,
});

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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  mockQuery({});
  features.q = '';
  preferences.prefs = undefined;
});

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

  it('AC-2.5.2 hides the muted cards of the server-rendered page and requests the feed with excludeTags', () => {
    preferences.prefs = { ...EMPTY_PREFERENCES, mute: { tags: ['career'], sources: [] } };
    mockQuery({
      data: {
        pages: [
          { items: [story('a', ['react']), story('b', ['career', 'rust'])], nextCursor: null },
        ],
        pageParams: [undefined],
      },
      isPlaceholderData: true,
    });
    const html = renderToStaticMarkup(<FeedList />);
    expect(html).toContain('data-story-id="a"');
    expect(html).not.toContain('data-story-id="b"');
    expect(feedQueryOptions).toHaveBeenLastCalledWith(expect.anything(), {
      excludeTags: ['career'],
    });
  });

  it('AC-1.3.14 marks the cards of a loading search with the q they were fetched for', () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onScreen = () =>
      [...container.querySelectorAll('article h2 mark')].map((mark) => mark.textContent);
    const render = () => act(() => root.render(<FeedList />));
    const titled = (title: string): FeedPage => ({
      items: [{ ...story('a'), title }],
      nextCursor: null,
    });
    const dataOf = (title: string) => ({ pages: [titled(title)], pageParams: [undefined] });

    features.q = 'alpha';
    mockQuery({ data: dataOf('Alpha bravo') });
    render();
    expect(onScreen()).toEqual(['Alpha']);

    features.q = 'bravo';
    mockQuery({ data: dataOf('Alpha bravo'), isPlaceholderData: true });
    render();
    expect(onScreen()).toEqual(['Alpha']);

    mockQuery({ data: dataOf('Bravo only'), isPlaceholderData: false });
    render();
    expect(onScreen()).toEqual(['Bravo']);

    features.q = '';
    mockQuery({ data: dataOf('Bravo only'), isPlaceholderData: true });
    render();
    expect(onScreen()).toEqual(['Bravo']);

    mockQuery({ data: dataOf('Plain'), isPlaceholderData: false });
    render();
    expect(onScreen()).toEqual([]);
    act(() => root.unmount());
  });
});
