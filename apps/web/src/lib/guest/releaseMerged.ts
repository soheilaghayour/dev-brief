import { keptAfterMerge, type MergeCollection, type MergeNote } from './guestMerge';
import { useGuestStore } from './guestStore';
import { loadLatestGuestStore } from './hydrateGuestStore';

/** Removes the boards and notes a confirmed merge carried from the device, unless they changed after the request was built. */
export async function releaseMergedCollectionsAndNotes(
  collections: readonly MergeCollection[],
  notes: readonly MergeNote[],
) {
  await loadLatestGuestStore();
  const { collections: held, notes: heldNotes } = useGuestStore.getState();
  useGuestStore.setState(
    keptAfterMerge({ collections: held, notes: heldNotes }, { collections, notes }),
  );
}
