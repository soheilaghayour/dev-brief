import { useGuestStore } from './guestStore';
import { hydrateGuestStore } from './hydrateGuestStore';

// Every change loads the store first and re-reads storage, so it builds on the saves any tab stored instead of replacing them.
function loadLatest() {
  hydrateGuestStore();
  useGuestStore.persist.rehydrate();
}

export function toggleGuestSave(storyId: string, now: Date) {
  loadLatest();
  return useGuestStore.getState().toggleSave(storyId, now);
}

/** Removes the saves and returns how many were actually there. */
export function removeGuestSaves(storyIds: readonly string[]) {
  loadLatest();
  return useGuestStore.getState().removeSaves(storyIds);
}

export function setGuestPendingMerge(pending: boolean) {
  loadLatest();
  useGuestStore.getState().setPendingMerge(pending);
}

/** The latest stored guest data, read after loading what any tab stored. */
export function latestGuestData() {
  loadLatest();
  return useGuestStore.getState();
}
