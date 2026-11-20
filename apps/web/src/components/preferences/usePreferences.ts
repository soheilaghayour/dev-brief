'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/lib/auth/useMe';
import { modeOf } from '@/lib/guest/preferenceModes';
import type { PreferenceKind, PreferenceMode, PreferenceValue } from '@/lib/guest/preferences';
import { changeAccountPreference, changeGuestPreference } from './changePreference';
import { usePreferenceState } from './usePreferenceState';

/** The one way components read and change follows and mutes: the account when signed in, this device otherwise. */
export function usePreferences() {
  const queryClient = useQueryClient();
  const { data: user } = useMe();
  const state = usePreferenceState();

  function modeOfValue<K extends PreferenceKind>(kind: K, value: PreferenceValue[K]) {
    return modeOf(state.prefs, kind, value);
  }

  function setMode<K extends PreferenceKind>(
    kind: K,
    value: PreferenceValue[K],
    mode: PreferenceMode | null,
  ) {
    void (user
      ? changeAccountPreference(queryClient, kind, value, mode)
      : changeGuestPreference(kind, value, mode));
  }

  return { ...state, modeOf: modeOfValue, setMode };
}
