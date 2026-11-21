import type { Collection, CollectionDetail, CollectionList } from '@devbrief/shared';

export const COLLECTIONS_KEY = ['collections'] as const;

export function collectionKey(id: string) {
  return ['collections', id] as const;
}

/** A collection the user just created, shown under this id until the server answers. */
const PENDING_ID_PREFIX = 'pending-';

export function pendingCollectionId(n: number) {
  return `${PENDING_ID_PREFIX}${n}`;
}

export function isPendingCollectionId(id: string) {
  return id.startsWith(PENDING_ID_PREFIX);
}

function inOrder(collections: readonly Collection[]) {
  return collections.map((collection, position) => ({ ...collection, position }));
}

function mapList(
  list: CollectionList | undefined,
  change: (items: Collection[]) => Collection[],
): CollectionList | undefined {
  return list && { items: change(list.items) };
}

/** The list with a collection added at the end. */
export function listWithCreated(list: CollectionList | undefined, created: Collection) {
  return mapList(list, (items) => [...items, { ...created, position: items.length }]);
}

/** The list with one collection replaced by another, as when the server's row takes a pending one's place. */
export function listWithReplaced(
  list: CollectionList | undefined,
  id: string,
  replacement: Collection,
) {
  return mapList(list, (items) =>
    items.map((collection) => (collection.id === id ? replacement : collection)),
  );
}

export function listRenamed(list: CollectionList | undefined, id: string, name: string) {
  return mapList(list, (items) =>
    items.map((collection) => (collection.id === id ? { ...collection, name } : collection)),
  );
}

/** The list with the collection moved to the 0-based index `position`, positions dense again. */
export function listMoved(list: CollectionList | undefined, id: string, position: number) {
  return mapList(list, (items) => {
    const moving = items.find((collection) => collection.id === id);
    if (!moving) return items;
    const others = items.filter((collection) => collection.id !== id);
    const index = Math.max(0, Math.min(position, others.length));
    return inOrder([...others.slice(0, index), moving, ...others.slice(index)]);
  });
}

export function listWithout(list: CollectionList | undefined, id: string) {
  return mapList(list, (items) => inOrder(items.filter((collection) => collection.id !== id)));
}

export function listItemCount(list: CollectionList | undefined, id: string, change: number) {
  return mapList(list, (items) =>
    items.map((collection) =>
      collection.id === id
        ? { ...collection, itemCount: Math.max(0, collection.itemCount + change) }
        : collection,
    ),
  );
}

export function detailRenamed(detail: CollectionDetail | undefined, name: string) {
  return detail && { ...detail, collection: { ...detail.collection, name } };
}

/** The board without those stories, its positions dense again. */
export function detailWithoutItems(
  detail: CollectionDetail | undefined,
  storyIds: readonly string[],
) {
  if (!detail) return detail;
  const removed = new Set(storyIds);
  const items = detail.items
    .filter((item) => !removed.has(item.story.id))
    .map((item, position) => ({ ...item, position }));
  return {
    collection: { ...detail.collection, itemCount: items.length },
    items,
  };
}
