'use client';

import { useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';

function dismiss() {
  useGuestStore.getState().dismissHint();
}

/** Whether the guest hint shows: only once the stored dismissal is known. */
export function useGuestHint() {
  const isReady = useGuestReady((state) => state.ready);
  const dismissed = useGuestStore((state) => state.hintDismissed);
  return { isVisible: isReady && !dismissed, dismiss };
}
