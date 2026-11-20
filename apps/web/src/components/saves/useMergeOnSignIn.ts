'use client';

import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMe } from '@/lib/auth/useMe';
import { guestMergeResult, planGuestMerge } from '@/lib/guest/guestMerge';
import { latestGuestData, removeGuestSaves, setGuestPendingMerge } from '@/lib/guest/guestSaves';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { notify } from './notify';

// Shared by every caller in this tab, so a remount or a second effect run never sends the merge twice.
let mergeInFlight: Promise<void> | null = null;

async function mergeGuestSaves(queryClient: QueryClient) {
  const plan = planGuestMerge(await latestGuestData());
  if (plan.action === 'none') return;
  if (plan.action === 'clearPending') {
    await setGuestPendingMerge(false);
    return;
  }
  await setGuestPendingMerge(true);
  let response;
  try {
    const { mergeSaves } = await import('@/lib/api/endpoints');
    response = await mergeSaves(plan.request);
  } catch {
    // Local saves and the pending flag stay, so the next load tries again.
    return;
  }
  // Only now that the server confirmed does the device let go of the saves.
  const result = guestMergeResult(plan.request, response);
  await removeGuestSaves(result.confirmedStoryIds);
  await setGuestPendingMerge(false);
  await queryClient.invalidateQueries({ queryKey: ['saves'] });
  if (result.notice) void notify(result.notice);
}

/** Moves the device's saves into the account once a signed-in user is known and the guest store has loaded. */
export function useMergeOnSignIn() {
  const queryClient = useQueryClient();
  const { data: user } = useMe();
  const isGuestStoreReady = useGuestReady((state) => state.ready);
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !isGuestStoreReady || mergeInFlight) return;
    mergeInFlight = mergeGuestSaves(queryClient).finally(() => {
      mergeInFlight = null;
    });
  }, [userId, isGuestStoreReady, queryClient]);
}
