import type { QueryClient } from '@tanstack/react-query';
import { isFeatureEnabled } from '@/config/features';
import { mergeSaves } from '@/lib/api/endpoints';
import { guestMergeResult, planGuestMerge } from '@/lib/guest/guestMerge';
import { clearGuestPreferences } from '@/lib/guest/guestPreferences';
import { latestGuestData, removeGuestSaves, setGuestPendingMerge } from '@/lib/guest/guestSaves';
import { EMPTY_PREFERENCES } from '@/lib/guest/guestState';
import { notify } from '@/lib/toast/notify';

/** Sends the device's saves and preferences to the account in one merge, and lets go of them once the server confirms. */
export async function mergeGuestData(queryClient: QueryClient) {
  const { saves, prefs, pendingMerge } = await latestGuestData();
  // The web sends preferences only while its flag lets a user create them.
  const plan = planGuestMerge({
    saves,
    prefs: isFeatureEnabled('preferences') ? prefs : EMPTY_PREFERENCES,
    pendingMerge,
  });
  if (plan.action === 'none') return;
  if (plan.action === 'clearPending') {
    await setGuestPendingMerge(false);
    return;
  }
  await setGuestPendingMerge(true);
  let response;
  try {
    response = await mergeSaves(plan.request);
  } catch {
    // Local saves, preferences and the pending flag stay, so the next load tries again.
    return;
  }
  // Only now that the server confirmed does the device let go of the saves and preferences.
  const result = guestMergeResult(plan.request, response);
  await removeGuestSaves(result.confirmedStoryIds);
  if (result.confirmedPreferences) await clearGuestPreferences();
  await setGuestPendingMerge(false);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['saves'] }),
    queryClient.invalidateQueries({ queryKey: ['prefs'] }),
  ]);
  if (result.notice) void notify(result.notice);
}
