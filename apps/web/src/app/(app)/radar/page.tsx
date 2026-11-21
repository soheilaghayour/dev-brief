import { notFound } from 'next/navigation';
import type { SearchParams } from 'nuqs/server';
import { isFeatureEnabled } from '@/config/features';
import { RadarPage } from '@/features/radar/RadarPage';
import { loadRadarSearchParams, toRadarFilters } from '@/features/radar/radarParams';
import { radarQueryOptions } from '@/features/radar/radarQueries';
import { getServerQueryClient, PrefetchedQueries } from '@/lib/query/PrefetchedQueries';

export const metadata = { title: 'Tech Radar' };

export default async function RadarRoute({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (!isFeatureEnabled('radar')) notFound();
  const filters = toRadarFilters(loadRadarSearchParams(await searchParams));
  // Awaited, so the header, controls and movers table are in the HTML; a failed fetch (no server retry) leaves the client to retry.
  await getServerQueryClient().prefetchQuery(radarQueryOptions(filters));

  return (
    <PrefetchedQueries>
      <RadarPage />
    </PrefetchedQueries>
  );
}
