'use client';

import { isFeatureEnabled } from '@/config/features';
import { useMe } from '@/lib/auth/useMe';
import { useAccountNotes } from './useAccountNotes';
import { useAccountSaves } from './useAccountSaves';
import { useGuestSaves } from './useGuestSaves';

/** The one way components read and change saves: the account when signed in, this device otherwise. */
export function useSaves() {
  const { data: user, isPending } = useMe();
  const guest = useGuestSaves();
  const account = useAccountSaves(Boolean(user));
  const accountNotes = useAccountNotes();

  if (user) {
    return {
      mode: 'account' as const,
      isReady: true,
      ...account,
      canNote: isFeatureEnabled('collections'),
      ...accountNotes,
    };
  }
  // Waiting for /me avoids treating someone about to be recognised as signed in as a guest.
  return {
    mode: 'guest' as const,
    isReady: guest.isReady && !isPending,
    ids: guest.ids,
    isSaved: guest.isSaved,
    toggle: guest.toggle,
    remove: guest.remove,
    canNote: isFeatureEnabled('collections'),
    note: guest.note,
    setNote: guest.setNote,
    setNoteNow: guest.setNoteNow,
    prepareNoteWrites: guest.prepareNoteWrites,
    savedAt: guest.savedAt,
  };
}
