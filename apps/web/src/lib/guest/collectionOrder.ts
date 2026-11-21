import type { GuestCollection } from './collectionsState';

// Split from collectionsState so reading collections doesn't load the slug and name rules that only writes need.

/** The collections ordered by position, which the store keeps dense. */
export function sortCollections(collections: readonly GuestCollection[]) {
  return [...collections].sort((a, b) => a.position - b.position);
}

/** A collection's items in board order. */
export function itemsInOrder(collection: GuestCollection) {
  return [...collection.items].sort((a, b) => a.position - b.position);
}
