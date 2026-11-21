import { queryOptions } from '@tanstack/react-query';
import type { RadarFilters } from './radarParams';

/** The radar query, shared by the server prefetch and the client page so their keys match (PRD §7.5). */
export function radarQueryOptions({ window, metric, tags }: RadarFilters) {
  return queryOptions({
    queryKey: ['radar', window, metric, tags],
    queryFn: async () => {
      // The endpoints module pulls in Zod and every contract; loading it on first use keeps it out of first-load JS.
      const { getRadar } = await import('@/lib/api/endpoints');
      return getRadar({ window, metric, tags });
    },
  });
}
