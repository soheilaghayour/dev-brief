import { useGuestStore } from './guestStore';
import { loadLatestGuestStore } from './hydrateGuestStore';
import type { Preferences } from '@devbrief/shared';
import type { PreferenceKind, PreferenceMode, PreferenceValue } from './preferences';
import { setPreference, withoutPreferences } from './preferenceModes';

// Not store actions: only the lazily loaded menu, Settings and the merge change preferences, so first-load JS doesn't carry this.

/** Follows, mutes or clears the value on this device; returns 'full' when a full list refused it. */
export async function setGuestPreference<K extends PreferenceKind>(
  kind: K,
  value: PreferenceValue[K],
  mode: PreferenceMode | null,
) {
  await loadLatestGuestStore();
  const { outcome, prefs } = setPreference(useGuestStore.getState().prefs, kind, value, mode);
  useGuestStore.setState({ prefs });
  return outcome;
}

/** Removes the entries of `sent` and keeps any other the device gained meanwhile. */
export async function removeGuestPreferences(sent: Preferences) {
  await loadLatestGuestStore();
  useGuestStore.setState({ prefs: withoutPreferences(useGuestStore.getState().prefs, sent) });
}
