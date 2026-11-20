import type { MutationOptions, QueryClient } from '@tanstack/react-query';
import { FEED_LIST_MAX } from '@devbrief/shared';
import type { Preferences } from '@devbrief/shared';
import type { PreferenceKind, PreferenceMode } from '@/lib/guest/preferences';
import { PREFS_KEY } from './usePreferenceState';

const PREFS_MUTATION_KEY = ['prefs', 'put'] as const;

export const PREFS_FAILED_NOTICE = "Couldn't update your feed preferences — retry";

const KIND_PLURALS = { tag: 'tags', source: 'sources' } as const satisfies Record<
  PreferenceKind,
  string
>;

/** The toast for a follow or mute that a full list refused. */
export function preferenceFullNotice(kind: PreferenceKind, mode: PreferenceMode) {
  return `You can ${mode} up to ${FEED_LIST_MAX} ${KIND_PLURALS[kind]}.`;
}

type PreferenceRequests = {
  putPreferences: (prefs: Preferences) => Promise<Preferences>;
  notify: (message: string) => Promise<void> | void;
};

/** The optimistic preferences mutation (PRD §7.5): every change sends the full set, patched into the cache first and rolled back with a toast on error. */
export function preferencesMutationOptions(
  queryClient: QueryClient,
  { putPreferences, notify }: PreferenceRequests,
): MutationOptions<Preferences, Error, Preferences, { previous: Preferences | undefined }> {
  return {
    mutationKey: PREFS_MUTATION_KEY,
    // Each request carries the whole set, so the requests must reach the server in click order.
    scope: { id: 'prefs' },
    mutationFn: (prefs) => putPreferences(prefs),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: PREFS_KEY, exact: true });
      const previous = queryClient.getQueryData<Preferences>(PREFS_KEY);
      queryClient.setQueryData(PREFS_KEY, next);
      return { previous };
    },
    onError: (_error, _next, snapshot) => {
      if (snapshot) queryClient.setQueryData(PREFS_KEY, snapshot.previous);
      void notify(PREFS_FAILED_NOTICE);
    },
    // Only the last of several quick changes refetches, so an early answer can't overwrite a later patch.
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: PREFS_MUTATION_KEY }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: PREFS_KEY, exact: true });
    },
  };
}
