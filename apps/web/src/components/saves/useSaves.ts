'use client';

import { useMe } from '@/lib/auth/useMe';
import { useAccountSaves } from './useAccountSaves';
import { useGuestSaves } from './useGuestSaves';

/** The one way components read and change saves: the account when signed in, this device otherwise. */
export function useSaves() {
  const { data: user, isPending } = useMe();
  const guest = useGuestSaves();
  const account = useAccountSaves(Boolean(user));

  if (user) return { mode: 'account' as const, isReady: true, ...account };
  // Waiting for /me avoids treating someone about to be recognised as signed in as a guest.
  return {
    mode: 'guest' as const,
    isReady: guest.isReady && !isPending,
    ids: guest.ids,
    isSaved: guest.isSaved,
    toggle: guest.toggle,
  };
}
