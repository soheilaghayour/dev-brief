import { useGuestStore } from './guestStore';
import { loadLatestGuestStore } from './hydrateGuestStore';
import type { Preferences } from '@devbrief/shared';
import type { PreferenceKind, PreferenceMode, PreferenceValue } from './preferences';
import { setPreferences, withoutPreferences } from './preferenceModes';

// Not store actions: only the lazily loaded menu, Settings and the merge change preferences, so first-load JS doesn't carry this.

/** Follows, mutes or clears the values on this device; returns 'full' when a full list refused it. */
export async function setGuestPreferences<K extends PreferenceKind>(
  kind: K,
  values: readonly PreferenceValue[K][],
  mode: PreferenceMode | null,
) {
  await loadLatestGuestStore();
  const { outcome, prefs } = setPreferences(useGuestStore.getState().prefs, kind, values, mode);
  useGuestStore.setState({ prefs });
  return outcome;
}

/** Removes the entries of `sent` and keeps any other the device gained meanwhile. */
export async function removeGuestPreferences(sent: Preferences) {
  await loadLatestGuestStore();
  useGuestStore.setState({ prefs: withoutPreferences(useGuestStore.getState().prefs, sent) });
}
