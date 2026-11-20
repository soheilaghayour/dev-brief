import type { QueryClient } from '@tanstack/react-query';
import { FEED_LIST_MAX } from '@devbrief/shared';
import type { Preferences } from '@devbrief/shared';
import { putPreferences } from '@/lib/api/endpoints';
import { setGuestPreference } from '@/lib/guest/guestPreferences';
import type { PreferenceKind, PreferenceMode, PreferenceValue } from '@/lib/guest/preferences';
import { setPreference, type PreferenceOutcome } from '@/lib/guest/preferenceModes';
import { notify } from '@/lib/toast/notify';
import { PREFS_FAILED_NOTICE, preferencesMutationOptions } from './accountPreferences';
import { PREFS_KEY, prefsQueryOptions } from './preferenceQueries';

const KIND_PLURALS = { tag: 'tags', source: 'sources' } as const satisfies Record<
  PreferenceKind,
  string
>;

function announce(outcome: PreferenceOutcome, kind: PreferenceKind, mode: PreferenceMode | null) {
  if (outcome === 'full' && mode) {
    void notify(`You can ${mode} up to ${FEED_LIST_MAX} ${KIND_PLURALS[kind]}.`);
  }
}

/** Follows, mutes or clears the value on this device. */
export async function changeGuestPreference<K extends PreferenceKind>(
  kind: K,
  value: PreferenceValue[K],
  mode: PreferenceMode | null,
) {
  announce(await setGuestPreference(kind, value, mode), kind, mode);
}

/** Follows, mutes or clears the value in the account, building on the stored set (loaded first if needed) and on changes still in flight. */
export async function changeAccountPreference<K extends PreferenceKind>(
  queryClient: QueryClient,
  kind: K,
  value: PreferenceValue[K],
  mode: PreferenceMode | null,
) {
  let loaded: Preferences;
  try {
    loaded = await queryClient.ensureQueryData(prefsQueryOptions);
  } catch {
    void notify(PREFS_FAILED_NOTICE);
    return;
  }
  // From here to the cache write nothing awaits, so changes made during the load build on each other instead of on the same set.
  const current = queryClient.getQueryData<Preferences>(PREFS_KEY) ?? loaded;
  const { outcome, prefs } = setPreference(current, kind, value, mode);
  announce(outcome, kind, mode);
  if (outcome === 'full') return;
  // A refetch in flight would overwrite the patch with the older set.
  void queryClient.cancelQueries({ queryKey: PREFS_KEY, exact: true });
  queryClient.setQueryData(PREFS_KEY, prefs);
  const mutation = queryClient
    .getMutationCache()
    .build(queryClient, preferencesMutationOptions(queryClient, { putPreferences, notify }));
  // The mutation's own onError shows the toast.
  await mutation.execute(prefs).catch(() => undefined);
}
