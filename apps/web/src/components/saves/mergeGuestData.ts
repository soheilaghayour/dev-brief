import type { QueryClient } from '@tanstack/react-query';
import type { MergeResponse } from '@devbrief/shared';
import { isFeatureEnabled } from '@/config/features';
import { ApiError } from '@/lib/api/apiError';
import { mergeSaves } from '@/lib/api/endpoints';
import {
  guestMergeRelease,
  mergeNotices,
  oversizedNotice,
  planGuestMerge,
} from '@/lib/guest/guestMerge';
import { removeGuestPreferences } from '@/lib/guest/guestPreferences';
import { latestGuestData, removeGuestSaves, setGuestPendingMerge } from '@/lib/guest/guestSaves';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';
import { releaseMergedCollectionsAndNotes } from '@/lib/guest/releaseMerged';
import { notify } from '@/lib/toast/notify';

async function refreshAccountData(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['saves'] }),
    queryClient.invalidateQueries({ queryKey: ['prefs'] }),
    queryClient.invalidateQueries({ queryKey: ['collections'] }),
  ]);
}

// The server refused the request itself, so sending it again can't help; a busy lock or a lost connection can.
function isRejected(error: unknown) {
  return error instanceof ApiError && [400, 413, 422].includes(error.status);
}

/** Sends the device's saves, preferences, collections and notes to the account, and lets go of each part once the server confirms the request that carried it. */
export async function mergeGuestData(queryClient: QueryClient) {
  const { saves, prefs, collections, notes, pendingMerge } = await latestGuestData();
  // The web sends only what its flags let a user create.
  const plan = planGuestMerge({
    saves,
    prefs: isFeatureEnabled('preferences') ? prefs : EMPTY_PREFERENCES,
    collections: isFeatureEnabled('collections') ? collections : [],
    notes: isFeatureEnabled('collections') ? notes : {},
    pendingMerge,
  });
  if (plan.action === 'none') return;
  if (plan.action === 'clearPending') {
    await setGuestPendingMerge(false);
    return;
  }
  await setGuestPendingMerge(true);
  const confirmed: MergeResponse[] = [];
  let isComplete = true;
  for (const request of plan.requests) {
    try {
      confirmed.push(await mergeSaves(request));
    } catch (error) {
      // What this request carried stays on the device with the pending flag, so the next load tries again.
      isComplete = false;
      if (isRejected(error)) {
        void notify(
          confirmed.length === 0
            ? "Couldn't sync your data: the server refused it. Nothing was merged, and your data stays on this device."
            : "Couldn't sync the rest of your data: the server refused it. What is left stays on this device.",
        );
      }
      break;
    }
    const release = guestMergeRelease(request);
    await removeGuestSaves(release.storyIds);
    if (release.preferences) await removeGuestPreferences(release.preferences);
    await releaseMergedCollectionsAndNotes(release.collections, release.notes);
  }
  const oversized = oversizedNotice(plan.oversized);
  if (oversized) void notify(oversized);
  // Boards too big to send stay on the device, so the merge isn't complete.
  if (isComplete && !oversized) await setGuestPendingMerge(false);
  if (confirmed.length === 0) return;
  await refreshAccountData(queryClient);
  for (const notice of mergeNotices(confirmed)) void notify(notice);
}
