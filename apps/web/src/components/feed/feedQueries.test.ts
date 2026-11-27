import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedPage, TagList } from '@devbrief/shared';
import { toFeedParams } from '@/lib/guest/preferences';
import type { FeedFilters } from './feedParams';
import {
  feedQueryOptions,
  personalisedPlaceholder,
  personalisedTagsPlaceholder,
  tagsQueryOptions,
} from './feedQueries';

const filters: FeedFilters = { sort: 'top', tags: ['react'], kinds: [], sources: [], q: '' };
const prefs = {
  follow: { tags: ['rust' as const], sources: [] },
  mute: { tags: ['career' as const], sources: ['devto'] },
};
const feedData = (...ids: string[]) => ({
  pages: [{ items: ids.map((id) => ({ id })), nextCursor: null } as unknown as FeedPage],
  pageParams: [undefined],
});

afterEach(() => vi.unstubAllGlobals());

describe('feedQueryOptions', () => {
  it('AC-2.5.2 sends the personal params with the feed request and keys the query by them', async () => {
    // The browser client calls same-origin paths; the fetch is captured when the endpoints module loads.
    vi.stubGlobal('window', {});
    const fetchFeed = vi.fn(async () => Response.json({ items: [], nextCursor: null }));
    vi.stubGlobal('fetch', fetchFeed);
    const options = feedQueryOptions(filters, toFeedParams(prefs));

    expect(options.queryKey).toEqual([
      'feed',
      {
        sort: 'top',
        tags: ['react'],
        excludeTags: ['career'],
        excludeSources: ['devto'],
        boostTags: ['rust'],
      },
    ]);
    await options.queryFn?.({ pageParam: undefined } as never);
    const url = new URL(String(fetchFeed.mock.calls.at(0)?.at(0)), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/feed');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      sort: 'top',
      tags: 'react',
      excludeTags: 'career',
      excludeSources: 'devto',
      boostTags: 'rust',
    });
  });

  it('AC-2.5.2 keeps the server-rendered key when there are no preferences', () => {
    expect(feedQueryOptions(filters, {}).queryKey).toEqual(feedQueryOptions(filters).queryKey);
  });
});

describe('personalisedPlaceholder', () => {
  it('AC-2.5.2 shows the server-rendered page for these filters until the personalised one arrives', () => {
    const queryClient = new QueryClient();
    const placeholder = personalisedPlaceholder(queryClient, filters);
    expect(placeholder()).toBeUndefined();

    const serverPage = feedData('a');
    queryClient.setQueryData(feedQueryOptions(filters).queryKey, serverPage);
    expect(placeholder()).toBe(serverPage);
    expect(personalisedPlaceholder(queryClient, { ...filters, tags: ['rust'] })()).toBeUndefined();
  });

  it('keeps the list the visitor was scrolling while a preference change loads the next one', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(feedQueryOptions(filters).queryKey, feedData('server'));
    const scrolled = feedData('a', 'b', 'c');
    expect(personalisedPlaceholder(queryClient, filters)(scrolled)).toBe(scrolled);
  });
});

describe('tagsQueryOptions', () => {
  const searching: FeedFilters = { ...filters, sort: 'latest', q: 'rust', kinds: ['hn'] };

  it('AC-1.3.11 keys the counts by the feed query without the tags, the page and the boosts', () => {
    expect(tagsQueryOptions(searching, toFeedParams(prefs)).queryKey).toEqual([
      'tags',
      {
        sort: 'latest',
        q: 'rust',
        kinds: ['hn'],
        excludeTags: ['career'],
        excludeSources: ['devto'],
      },
    ]);
  });

  it('AC-1.3.11 asks again when the sort, the search, the kinds, the sources or a mute change', () => {
    const keys = [
      tagsQueryOptions(filters),
      tagsQueryOptions({ ...filters, sort: 'latest' }),
      tagsQueryOptions({ ...filters, q: 'rust' }),
      tagsQueryOptions({ ...filters, kinds: ['hn'] }),
      tagsQueryOptions({ ...filters, sources: ['blog'] }),
      tagsQueryOptions(filters, { excludeTags: ['career'] }),
      tagsQueryOptions(filters, { excludeSources: ['devto'] }),
    ].map((options) => JSON.stringify(options.queryKey));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('AC-1.3.11 does not ask again when a tag is selected or a follow changes', () => {
    const base = tagsQueryOptions(filters).queryKey;
    expect(tagsQueryOptions({ ...filters, tags: ['rust', 'go'] }).queryKey).toEqual(base);
    expect(
      tagsQueryOptions(filters, { boostTags: ['rust'], boostSources: ['hn'] }).queryKey,
    ).toEqual(base);
  });

  it('AC-1.3.11 requests the counts with the keyed parameters', async () => {
    vi.stubGlobal('window', {});
    const fetchTags = vi.fn(async () => Response.json({ version: 1, tags: [] }));
    vi.stubGlobal('fetch', fetchTags);
    await tagsQueryOptions(searching, toFeedParams(prefs)).queryFn?.({} as never);
    const url = new URL(String(fetchTags.mock.calls.at(0)?.at(0)), 'http://localhost');
    expect(url.pathname).toBe('/api/v1/tags');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      sort: 'latest',
      q: 'rust',
      kinds: 'hn',
      excludeTags: 'career',
      excludeSources: 'devto',
    });
  });
});

describe('personalisedTagsPlaceholder', () => {
  const counts = (count: number): TagList => ({
    version: 1,
    tags: [{ slug: 'react', label: 'React', count }],
  });

  it('AC-1.3.11 keeps the previous numbers while new ones load, and the public ones at first', () => {
    const queryClient = new QueryClient();
    const placeholder = personalisedTagsPlaceholder(queryClient, filters);
    expect(placeholder()).toBeUndefined();

    const publicCounts = counts(5);
    queryClient.setQueryData(tagsQueryOptions(filters).queryKey, publicCounts);
    expect(placeholder()).toBe(publicCounts);
    const previous = counts(9);
    expect(placeholder(previous)).toBe(previous);
  });
});
