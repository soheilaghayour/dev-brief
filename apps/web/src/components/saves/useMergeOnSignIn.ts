'use client';

import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMe } from '@/lib/auth/useMe';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';

// Shared by every caller in this tab, so a remount or a second effect run never sends the merge twice.
let mergeInFlight: Promise<void> | null = null;

// The merge code loads only for a signed-in visit, so a guest's first-load JS doesn't carry it.
async function loadAndMerge(queryClient: QueryClient) {
  const { mergeGuestData } = await import('./mergeGuestData');
  await mergeGuestData(queryClient);
}

/** Moves the device's saves and preferences into the account once a signed-in user is known and the guest store has loaded. */
export function useMergeOnSignIn() {
  const queryClient = useQueryClient();
  const { data: user } = useMe();
  const isGuestStoreReady = useGuestReady((state) => state.ready);
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !isGuestStoreReady || mergeInFlight) return;
    mergeInFlight = loadAndMerge(queryClient).finally(() => {
      mergeInFlight = null;
    });
  }, [userId, isGuestStoreReady, queryClient]);
}
