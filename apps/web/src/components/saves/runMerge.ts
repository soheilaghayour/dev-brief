import type { QueryClient } from '@tanstack/react-query';

// Shared by every caller in this tab, so a remount, a second effect run or a sign-out never sends the merge twice at once.
let mergeInFlight: Promise<void> | null = null;

// The merge code loads only for a signed-in visit, so a guest's first-load JS doesn't carry it.
async function loadAndMerge(queryClient: QueryClient) {
  const { mergeGuestData } = await import('./mergeGuestData');
  await mergeGuestData(queryClient);
}

/** Runs the merge, or joins the one already running; resolves when it has finished, whatever it achieved. */
export function runMerge(queryClient: QueryClient) {
  mergeInFlight ??= loadAndMerge(queryClient).finally(() => {
    mergeInFlight = null;
  });
  return mergeInFlight;
}

export function isMergeRunning() {
  return mergeInFlight !== null;
}
