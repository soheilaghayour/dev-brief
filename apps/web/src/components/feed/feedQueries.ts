import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { FeedPage, TagList } from '@devbrief/shared';
import type { PersonalFeedParams } from '@/lib/guest/preferences';
import { toFeedParams, type FeedFilters } from './feedParams';

type FeedData = InfiniteData<FeedPage, string | undefined>;

/** The infinite feed query, shared by the server prefetch and the client list so their keys match; personal params join the request and key, never the URL. */
export function feedQueryOptions(filters: FeedFilters, personal: PersonalFeedParams = {}) {
  const params = { ...toFeedParams(filters), ...personal };
  return infiniteQueryOptions({
    queryKey: ['feed', params],
    queryFn: async ({ pageParam }) => {
      // The endpoints module pulls in Zod and every contract; loading it on first use keeps it out of first-load JS.
      const { getFeed } = await import('@/lib/api/endpoints');
      return getFeed({ ...params, cursor: pageParam });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

/** While the next stories load, the list keeps what it showed, or the server-rendered page for these filters at first. */
export function personalisedPlaceholder(queryClient: QueryClient, filters: FeedFilters) {
  const publicKey = feedQueryOptions(filters).queryKey;
  return (previous?: FeedData) => previous ?? queryClient.getQueryData<FeedData>(publicKey);
}

/** The feed's query without what the counts ignore (the selected tags, the page, the boosts), so ticking a tag asks nothing new. */
function tagCountParams(filters: FeedFilters, { excludeTags, excludeSources }: PersonalFeedParams) {
  return {
    ...toFeedParams({ ...filters, tags: [] }),
    ...(excludeTags && { excludeTags }),
    ...(excludeSources && { excludeSources }),
  };
}

/** The tag counts for the list these filters show; shared by the server prefetch and the sidebar so their keys match. */
export function tagsQueryOptions(filters: FeedFilters, personal: PersonalFeedParams = {}) {
  const params = tagCountParams(filters, personal);
  return queryOptions({
    queryKey: ['tags', params],
    queryFn: async () => (await import('@/lib/api/endpoints')).getTags(params),
  });
}

/** While personal counts load, the sidebar keeps its last numbers, or the server-rendered public counts at first. */
export function personalisedTagsPlaceholder(queryClient: QueryClient, filters: FeedFilters) {
  const publicKey = tagsQueryOptions(filters).queryKey;
  return (previous?: TagList) => previous ?? queryClient.getQueryData<TagList>(publicKey);
}

export const sourcesQueryOptions = queryOptions({
  queryKey: ['sources'],
  queryFn: async () => (await import('@/lib/api/endpoints')).getSources(),
});
