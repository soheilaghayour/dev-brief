import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeedPage, Preferences } from '@devbrief/shared';
import { ApiError } from '@/lib/api/apiError';
import { toFeedParams } from '@/lib/guest/preferences';
import type { FeedFilters } from './feedParams';
import { feedQueryOptions } from './feedQueries';

const api = vi.hoisted(() => ({ getMe: vi.fn(), getPreferences: vi.fn(), getFeed: vi.fn() }));
vi.mock('@/lib/api/endpoints', () => api);
vi.mock('@/config/features', () => ({ isFeatureEnabled: () => true }));

const { prefetchFeed } = await import('./prefetchFeed');

const filters: FeedFilters = { sort: 'top', tags: [], kinds: [], sources: [], q: '' };
const SESSION = 'theme=dark; __Secure-better-auth.session_token=abc';
const MUTED: Preferences = {
  follow: { tags: [], sources: [] },
  mute: { tags: ['career'], sources: [] },
};

const stories = [
  { id: 'react-story', tags: ['react'] },
  { id: 'career-story', tags: ['career'] },
];

function firstPageIds(queryClient: QueryClient, personal = {}) {
  const data = queryClient.getQueryData<InfiniteData<FeedPage>>(
    feedQueryOptions(filters, personal).queryKey,
  );
  return data?.pages[0]?.items.map(({ id }) => id);
}

beforeEach(() => {
  vi.resetAllMocks();
  // The API's own exclusion rule: a muted tag hides the story.
  api.getFeed.mockImplementation(async (params: { excludeTags?: string[] }) => ({
    items: stories.filter((story) => !story.tags.some((tag) => params.excludeTags?.includes(tag))),
    nextCursor: null,
  }));
});

describe('prefetchFeed', () => {
  it("AC-2.5.2 renders no muted story in a signed-in visitor's first page, and hands the account to the browser", async () => {
    api.getMe.mockResolvedValue({ id: 'u1' });
    api.getPreferences.mockResolvedValue(MUTED);
    const queryClient = new QueryClient();

    await prefetchFeed(queryClient, filters, SESSION);

    expect(firstPageIds(queryClient, toFeedParams(MUTED))).toEqual(['react-story']);
    expect(api.getMe).toHaveBeenCalledWith({ cookie: SESSION });
    expect(queryClient.getQueryData(['me'])).toEqual({ id: 'u1' });
    expect(queryClient.getQueryData(['prefs'])).toEqual(MUTED);
  });

  it('AC-2.5.2 fetches the public page, and no account, without a session cookie', async () => {
    const queryClient = new QueryClient();

    await prefetchFeed(queryClient, filters, 'theme=dark');
    await prefetchFeed(new QueryClient(), filters, null);

    expect(api.getMe).not.toHaveBeenCalled();
    expect(firstPageIds(queryClient)).toEqual(['react-story', 'career-story']);
  });

  it('treats a session the API rejects as a guest', async () => {
    api.getMe.mockRejectedValue(new ApiError('UNAUTHENTICATED', 'Sign in', 'r1', 401, undefined));
    const queryClient = new QueryClient();

    await prefetchFeed(queryClient, filters, SESSION);

    expect(queryClient.getQueryData(['me'])).toBeNull();
    expect(api.getPreferences).not.toHaveBeenCalled();
    expect(firstPageIds(queryClient)).toEqual(['react-story', 'career-story']);
  });
});
