'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '@/lib/auth/useMe';
import { useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';
import { toFeedParams } from '@/lib/guest/preferences';
import { prefsQueryOptions } from './preferenceQueries';

/** The read side of `usePreferences()`: the account's preferences when signed in, this device's otherwise. */
export function usePreferenceState() {
  const { data: user, isPending } = useMe();
  const guestPrefs = useGuestStore((state) => state.prefs);
  const isGuestReady = useGuestReady((state) => state.ready);
  const isAccount = Boolean(user);
  const prefsQuery = useQuery({
    ...prefsQueryOptions,
    enabled: isAccount,
  });

  const accountPrefs = prefsQuery.data;
  // Waiting for /me avoids treating someone about to be recognised as signed in as a guest.
  const isReady = isAccount ? accountPrefs !== undefined : isGuestReady && !isPending;
  const prefs = isAccount ? (accountPrefs ?? EMPTY_PREFERENCES) : guestPrefs;
  // Until the preferences are known the feed keeps the public key, so its first page isn't refetched twice.
  const feedParams = useMemo(() => (isReady ? toFeedParams(prefs) : {}), [isReady, prefs]);

  return {
    isReady,
    isError: isAccount && prefsQuery.isError,
    refetch: prefsQuery.refetch,
    prefs,
    feedParams,
  };
}
