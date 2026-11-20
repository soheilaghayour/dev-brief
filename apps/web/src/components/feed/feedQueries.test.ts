import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeedPage } from '@devbrief/shared';
import { toFeedParams } from '@/lib/guest/preferences';
import type { FeedFilters } from './feedParams';
import { feedQueryOptions, personalisedPlaceholder } from './feedQueries';

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
});
