import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';

/** Builds a QueryClient with the app-wide defaults (PRD §7.5). */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, retry: 2 },
      mutations: { retry: 0 },
      dehydrate: {
        // Pending queries are sent too, so a server prefetch can stream into the client cache.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}
