import { useGuestStore } from './guestStore';
import { loadLatestGuestStore } from './hydrateGuestStore';
import { EMPTY_PREFERENCES } from './guestState';
import type { PreferenceKind, PreferenceMode, PreferenceValue } from './preferences';
import { setPreference } from './preferenceModes';

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

export async function clearGuestPreferences() {
  await loadLatestGuestStore();
  useGuestStore.setState({ prefs: EMPTY_PREFERENCES });
}
