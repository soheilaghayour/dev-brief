'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/lib/auth/useMe';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { isMergeRunning, runMerge } from './runMerge';

/** Merges the device's data into the account once a signed-in user is known and the guest store has loaded. */
export function useMergeOnSignIn() {
  const queryClient = useQueryClient();
  const { data: user } = useMe();
  const isGuestStoreReady = useGuestReady((state) => state.ready);
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !isGuestStoreReady || isMergeRunning()) return;
    void runMerge(queryClient);
  }, [userId, isGuestStoreReady, queryClient]);
}
