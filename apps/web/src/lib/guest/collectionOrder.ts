import type { GuestCollection } from './collectionsState';

// Split from collectionsState so reading collections doesn't load the slug and name rules that only writes need.
// The one home of the "remove and close the gap" rule, for the store's unsave and the collection writers alike.

/** The collections ordered by position, which the store keeps dense. */
export function sortCollections(collections: readonly GuestCollection[]) {
  return [...collections].sort((a, b) => a.position - b.position);
}

/** A collection's items in board order. */
export function itemsInOrder(collection: GuestCollection) {
  return [...collection.items].sort((a, b) => a.position - b.position);
}

/** The entries with positions 0, 1, 2… in their current order; closes any gap. */
export function inPositionOrder<T extends { position: number }>(entries: readonly T[]) {
  return entries.map((entry, position) => ({ ...entry, position }));
}

/** The collection without those stories, its items' positions dense again. */
export function withoutStories(collection: GuestCollection, storyIds: readonly string[]) {
  const removed = new Set(storyIds);
  return {
    ...collection,
    items: inPositionOrder(collection.items.filter((item) => !removed.has(item.storyId))),
  };
}
