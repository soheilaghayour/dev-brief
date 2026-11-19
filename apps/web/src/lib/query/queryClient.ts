import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';

/** Builds a QueryClient with the app-wide defaults (PRD §7.5); `retry` overrides the query retry count. */
export function makeQueryClient({ retry = 2 }: { retry?: number } = {}) {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry },
      mutations: { retry: 0 },
      dehydrate: {
        // Pending queries are sent too, so a server prefetch can stream into the client cache.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}
