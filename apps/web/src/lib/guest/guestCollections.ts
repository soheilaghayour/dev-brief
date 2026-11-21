import {
  addToCollection,
  createCollection,
  deleteCollection,
  moveCollection,
  removeFromCollection,
  renameCollection,
} from './collectionsState';
import { newUuid, useGuestStore } from './guestStore';
import { loadLatestGuestStore } from './hydrateGuestStore';

// Not store actions, like the preference writers: only the sidebar, the dialogs and the board change collections, so first-load JS doesn't carry them.
// Each waits for the stored data to load and builds on what any tab stored.

export async function createGuestCollection(name: string) {
  await loadLatestGuestStore();
  const { outcome, collections, created } = createCollection(
    useGuestStore.getState().collections,
    name,
    newUuid(),
  );
  if (outcome === 'created') useGuestStore.setState({ collections });
  return { outcome, created };
}

export async function renameGuestCollection(id: string, name: string) {
  await loadLatestGuestStore();
  const { outcome, collections } = renameCollection(useGuestStore.getState().collections, id, name);
  if (outcome === 'renamed') useGuestStore.setState({ collections });
  return outcome;
}

export async function moveGuestCollection(id: string, direction: 'up' | 'down') {
  await loadLatestGuestStore();
  useGuestStore.setState({
    collections: moveCollection(useGuestStore.getState().collections, id, direction),
  });
}

export async function deleteGuestCollection(id: string) {
  await loadLatestGuestStore();
  useGuestStore.setState({
    collections: deleteCollection(useGuestStore.getState().collections, id),
  });
}

/** Adds the story to the collection, saving it too when needed, in one write. */
export async function addGuestCollectionItem(collectionId: string, storyId: string, now: Date) {
  await loadLatestGuestStore();
  const { saves, collections } = useGuestStore.getState();
  const result = addToCollection({ saves, collections }, collectionId, storyId, now);
  if (result.outcome === 'added')
    useGuestStore.setState({ saves: result.saves, collections: result.collections });
  return result.outcome;
}

export async function removeGuestCollectionItems(
  collectionId: string,
  storyIds: readonly string[],
) {
  await loadLatestGuestStore();
  useGuestStore.setState({
    collections: removeFromCollection(useGuestStore.getState().collections, collectionId, storyIds),
  });
}
