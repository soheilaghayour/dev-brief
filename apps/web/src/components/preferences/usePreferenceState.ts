'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isFeatureEnabled } from '@/config/features';
import { useMe } from '@/lib/auth/useMe';
import { useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';
import { toFeedParams } from '@/lib/guest/preferences';
import { prefsQueryOptions } from './prefsQuery';

/**
 * The read side of `usePreferences()`: the account's preferences when signed in, this device's otherwise.
 * The feed reads preferences on first load but never changes them, so it uses this without the write path.
 */
export function usePreferenceState() {
  const isEnabled = isFeatureEnabled('preferences');
  const { data: user, isPending } = useMe();
  const guestPrefs = useGuestStore((state) => state.prefs);
  const isGuestReady = useGuestReady((state) => state.ready);
  const isAccount = Boolean(user);
  const { data: accountPrefs } = useQuery({
    ...prefsQueryOptions,
    enabled: isEnabled && isAccount,
  });

  // Waiting for /me avoids treating someone about to be recognised as signed in as a guest.
  const isReady = isAccount ? accountPrefs !== undefined : isGuestReady && !isPending;
  const current = isAccount ? (accountPrefs ?? EMPTY_PREFERENCES) : guestPrefs;
  // With the flag off nothing can set a preference, so stored ones from an earlier build stay unused.
  const prefs = isEnabled ? current : EMPTY_PREFERENCES;
  const feedParams = useMemo(() => toFeedParams(prefs), [prefs]);

  return { isAccount, isReady, prefs, feedParams };
}
