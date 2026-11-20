import { MutationObserver, type QueryClient } from '@tanstack/react-query';
import type { Preferences } from '@devbrief/shared';
import { putPreferences } from '@/lib/api/endpoints';
import { setGuestPreference } from '@/lib/guest/guestPreferences';
import type { PreferenceKind, PreferenceMode, PreferenceValue } from '@/lib/guest/preferences';
import { setPreference, type PreferenceOutcome } from '@/lib/guest/preferenceModes';
import { notify } from '@/lib/toast/notify';
import {
  PREFS_FAILED_NOTICE,
  preferenceFullNotice,
  preferencesMutationOptions,
} from './accountPreferences';
import { prefsQueryOptions } from './usePreferenceState';

function announce(outcome: PreferenceOutcome, kind: PreferenceKind, mode: PreferenceMode | null) {
  if (outcome === 'full' && mode) void notify(preferenceFullNotice(kind, mode));
}

/** Follows, mutes or clears the value on this device. */
export async function changeGuestPreference<K extends PreferenceKind>(
  kind: K,
  value: PreferenceValue[K],
  mode: PreferenceMode | null,
) {
  announce(await setGuestPreference(kind, value, mode), kind, mode);
}

/**
 * Follows, mutes or clears the value in the account. The PUT replaces the whole set, so the change starts from
 * the stored set (loading it first if needed), read from the cache so it builds on a change still in flight.
 */
export async function changeAccountPreference<K extends PreferenceKind>(
  queryClient: QueryClient,
  kind: K,
  value: PreferenceValue[K],
  mode: PreferenceMode | null,
) {
  let current: Preferences;
  try {
    current = await queryClient.ensureQueryData(prefsQueryOptions);
  } catch {
    void notify(PREFS_FAILED_NOTICE);
    return;
  }
  const { outcome, prefs } = setPreference(current, kind, value, mode);
  announce(outcome, kind, mode);
  if (outcome === 'full') return;
  const mutation = new MutationObserver(
    queryClient,
    preferencesMutationOptions(queryClient, { putPreferences, notify }),
  );
  // The mutation's own onError rolls back and shows the toast.
  await mutation.mutate(prefs).catch(() => undefined);
}
