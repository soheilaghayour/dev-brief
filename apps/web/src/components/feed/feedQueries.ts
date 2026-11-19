import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { getFeed, getSources, getTags } from '@/lib/api/endpoints';
import { toFeedParams, type FeedFilters } from './feedParams';

/** The infinite feed query, shared by the server prefetch and the client list so their keys match. */
export function feedQueryOptions(filters: FeedFilters) {
  const params = toFeedParams(filters);
  return infiniteQueryOptions({
    queryKey: ['feed', params],
    queryFn: ({ pageParam }) => getFeed({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export const tagsQueryOptions = queryOptions({ queryKey: ['tags'], queryFn: getTags });

export const sourcesQueryOptions = queryOptions({ queryKey: ['sources'], queryFn: getSources });
