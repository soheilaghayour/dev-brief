import type { MutationOptions, QueryClient } from '@tanstack/react-query';
import type { Preferences } from '@devbrief/shared';
import { PREFS_KEY } from './preferenceQueries';

const PREFS_MUTATION_KEY = ['prefs', 'put'] as const;

export const PREFS_FAILED_NOTICE = "Couldn't update your feed preferences — retry";

type PreferenceRequests = {
  putPreferences: (prefs: Preferences) => Promise<Preferences>;
  notify: (message: string) => Promise<void> | void;
};

/**
 * The preferences mutation (PRD §7.5): every change sends the full set, which the caller has patched into the cache first.
 * A failure toasts, and the refetch after the last change puts the server's set back.
 */
export function preferencesMutationOptions(
  queryClient: QueryClient,
  { putPreferences, notify }: PreferenceRequests,
): MutationOptions<Preferences, Error, Preferences> {
  return {
    mutationKey: PREFS_MUTATION_KEY,
    // Each request carries the whole set, so the requests must reach the server in click order.
    scope: { id: 'prefs' },
    mutationFn: (prefs) => putPreferences(prefs),
    onError: () => {
      void notify(PREFS_FAILED_NOTICE);
    },
    // Only the last of several quick changes refetches, so an early answer can't overwrite a later patch.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: PREFS_MUTATION_KEY }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: PREFS_KEY, exact: true });
    },
  };
}
