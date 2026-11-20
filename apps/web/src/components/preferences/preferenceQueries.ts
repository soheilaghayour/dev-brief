import { queryOptions } from '@tanstack/react-query';

export const PREFS_KEY = ['prefs'] as const;

export const prefsQueryOptions = queryOptions({
  queryKey: PREFS_KEY,
  // The endpoints module (and Zod with it) loads on the first request, not with the page.
  queryFn: async () => (await import('@/lib/api/endpoints')).getPreferences(),
});
