import { useGuestStore } from './guestStore';
import { loadLatestGuestStore as loadLatest } from './hydrateGuestStore';

export async function toggleGuestSave(storyId: string, now: Date) {
  await loadLatest();
  return useGuestStore.getState().toggleSave(storyId, now);
}

/** Removes the saves, keeping their collection items for the merge, and returns how many were actually there. */
export async function removeGuestSaves(storyIds: readonly string[]) {
  await loadLatest();
  return useGuestStore.getState().removeSaves(storyIds);
}

/** Removes saves of stories that no longer exist, and them from every collection; returns how many saves were actually there. */
export async function purgeGuestSaves(storyIds: readonly string[]) {
  await loadLatest();
  return useGuestStore.getState().purgeSaves(storyIds);
}

export async function setGuestPendingMerge(pending: boolean) {
  await loadLatest();
  useGuestStore.getState().setPendingMerge(pending);
}

/** The latest stored guest data, read after loading what any tab stored. */
export async function latestGuestData() {
  await loadLatest();
  return useGuestStore.getState();
}
