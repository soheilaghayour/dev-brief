import { useGuestStore } from './guestStore';
import { hydrateGuestStore } from './hydrateGuestStore';

// Every change waits for the parser, loads the store and re-reads storage, so it builds on the saves any tab stored instead of replacing them.
async function loadLatest() {
  await hydrateGuestStore();
  await useGuestStore.persist.rehydrate();
}

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
