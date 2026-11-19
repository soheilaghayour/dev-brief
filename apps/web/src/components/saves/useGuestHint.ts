'use client';

import { useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { useMe } from '@/lib/auth/useMe';

function dismiss() {
  useGuestStore.getState().dismissHint();
}

/** Whether the guest hint shows: only to a guest, and only once the stored dismissal is known. */
export function useGuestHint() {
  const isReady = useGuestReady((state) => state.ready);
  const dismissed = useGuestStore((state) => state.hintDismissed);
  const { data: user, isPending } = useMe();
  return { isVisible: isReady && !dismissed && !isPending && !user, dismiss };
}
