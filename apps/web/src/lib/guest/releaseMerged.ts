import { sortCollections } from './collectionOrder';
import { toMergeCollection, type MergeCollection, type MergeNote } from './guestMerge';
import { useGuestStore } from './guestStore';
import { loadLatestGuestStore } from './hydrateGuestStore';

/**
 * Removes the boards and notes a confirmed merge carried, except one that changed after the request was built:
 * it still holds something the account lacks, and the next merge sends it again.
 */
export async function releaseMergedCollectionsAndNotes(
  collections: readonly MergeCollection[],
  notes: readonly MergeNote[],
) {
  await loadLatestGuestStore();
  const { collections: heldCollections, notes: heldNotes } = useGuestStore.getState();
  const sentBoards = new Map(collections.map((board) => [board.slug, JSON.stringify(board)]));
  const sentNotes = new Map(notes.map((sent) => [sent.storyId, sent]));
  useGuestStore.setState({
    collections: sortCollections(heldCollections)
      .filter((held) => sentBoards.get(held.slug) !== JSON.stringify(toMergeCollection(held)))
      .map((held, position) => ({ ...held, position })),
    notes: Object.fromEntries(
      Object.entries(heldNotes).filter(([storyId, held]) => {
        const sent = sentNotes.get(storyId);
        return !(sent && sent.note === held.note && sent.updatedAt === held.updatedAt);
      }),
    ),
  });
}
