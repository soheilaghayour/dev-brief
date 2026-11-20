import { useGuestStore } from './guestStore';
import { loadLatestGuestStore as loadLatest } from './hydrateGuestStore';

export async function toggleGuestSave(storyId: string, now: Date) {
  await loadLatest();
  return useGuestStore.getState().toggleSave(storyId, now);
}

/** Removes the saves and returns how many were actually there. */
export async function removeGuestSaves(storyIds: readonly string[]) {
  await loadLatest();
  return useGuestStore.getState().removeSaves(storyIds);
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
