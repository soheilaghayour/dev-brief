import type { SearchParams } from 'nuqs/server';
import { ActiveFilters } from '@/components/feed/ActiveFilters';
import { FeedList } from '@/components/feed/FeedList';
import { loadFeedSearchParams, toFeedFilters } from '@/components/feed/feedParams';
import { feedQueryOptions } from '@/components/feed/feedQueries';
import { getServerQueryClient, PrefetchedQueries } from '@/lib/query/PrefetchedQueries';

export const metadata = { title: 'Feed' };

export default async function FeedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const filters = toFeedFilters(loadFeedSearchParams(await searchParams));
  // Awaited, so the first page is in the HTML; a failed fetch (no server retry) leaves the client to retry.
  await getServerQueryClient().prefetchInfiniteQuery(feedQueryOptions(filters));

  return (
    <PrefetchedQueries>
      <h1 className="sr-only">Feed</h1>
      <ActiveFilters />
      <FeedList />
    </PrefetchedQueries>
  );
}
