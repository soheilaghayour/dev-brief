import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { toFeedParams, type FeedFilters } from './feedParams';

// The endpoints module pulls in Zod and every contract; loading it on first use keeps it out of first-load JS.
/** The infinite feed query, shared by the server prefetch and the client list so their keys match. */
export function feedQueryOptions(filters: FeedFilters) {
  const params = toFeedParams(filters);
  return infiniteQueryOptions({
    queryKey: ['feed', params],
    queryFn: async ({ pageParam }) => {
      const { getFeed } = await import('@/lib/api/endpoints');
      return getFeed({ ...params, cursor: pageParam });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export const tagsQueryOptions = queryOptions({
  queryKey: ['tags'],
  queryFn: async () => (await import('@/lib/api/endpoints')).getTags(),
});

export const sourcesQueryOptions = queryOptions({
  queryKey: ['sources'],
  queryFn: async () => (await import('@/lib/api/endpoints')).getSources(),
});
