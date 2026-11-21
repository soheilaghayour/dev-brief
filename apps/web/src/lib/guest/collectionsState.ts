import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  CollectionNameSchema,
  collectionSlug,
} from '@devbrief/shared';
import type { Save } from '@devbrief/shared';
import { inPositionOrder, sortCollections, withoutStories } from './collectionOrder';
import { MAX_GUEST_SAVES } from './guestState';

export type GuestCollectionItem = { storyId: string; position: number; addedAt: string };

export type GuestCollection = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  position: number;
  items: GuestCollectionItem[];
};

export type CreateOutcome = 'created' | 'full' | 'invalid';
export type RenameOutcome = 'renamed' | 'invalid' | 'missing';
export type AddItemOutcome = 'added' | 'exists' | 'collectionFull' | 'savesFull' | 'missing';

/** Adds a collection at the end; its slug is the one the server would give, and an over-limit or invalid name changes nothing. */
export function createCollection(
  collections: readonly GuestCollection[],
  name: string,
  id: string,
): { outcome: CreateOutcome; collections: GuestCollection[]; created?: GuestCollection } {
  const parsed = CollectionNameSchema.safeParse(name);
  if (!parsed.success) return { outcome: 'invalid', collections: [...collections] };
  if (collections.length >= COLLECTIONS_MAX)
    return { outcome: 'full', collections: [...collections] };
  const created: GuestCollection = {
    id,
    slug: collectionSlug(
      parsed.data,
      collections.map(({ slug }) => slug),
    ),
    name: parsed.data,
    description: null,
    position: collections.length,
    items: [],
  };
  return { outcome: 'created', collections: [...collections, created], created };
}

/** Changes the name only: the slug stays, so board links survive. */
export function renameCollection(
  collections: readonly GuestCollection[],
  id: string,
  name: string,
): { outcome: RenameOutcome; collections: GuestCollection[] } {
  if (!collections.some((collection) => collection.id === id))
    return { outcome: 'missing', collections: [...collections] };
  const parsed = CollectionNameSchema.safeParse(name);
  if (!parsed.success) return { outcome: 'invalid', collections: [...collections] };
  return {
    outcome: 'renamed',
    collections: collections.map((collection) =>
      collection.id === id ? { ...collection, name: parsed.data } : collection,
    ),
  };
}

/** Swaps the collection with its neighbour; at either end nothing changes. */
export function moveCollection(
  collections: readonly GuestCollection[],
  id: string,
  direction: 'up' | 'down',
) {
  const ordered = sortCollections(collections);
  const from = ordered.findIndex((collection) => collection.id === id);
  const to = direction === 'up' ? from - 1 : from + 1;
  const moved = ordered[from];
  if (!moved || to < 0 || to >= ordered.length) return [...collections];
  ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  return inPositionOrder(ordered);
}

export function deleteCollection(collections: readonly GuestCollection[], id: string) {
  return inPositionOrder(sortCollections(collections).filter((collection) => collection.id !== id));
}

type SavesAndCollections = { saves: readonly Save[]; collections: readonly GuestCollection[] };

/** Adds the story to the collection, saving it first when it isn't saved; a full collection or save list refuses instead of dropping anything. */
export function addToCollection(
  { saves, collections }: SavesAndCollections,
  collectionId: string,
  storyId: string,
  now: Date,
): { outcome: AddItemOutcome; saves: Save[]; collections: GuestCollection[] } {
  const unchanged = (outcome: AddItemOutcome) => ({
    outcome,
    saves: [...saves],
    collections: [...collections],
  });
  const target = collections.find((collection) => collection.id === collectionId);
  if (!target) return unchanged('missing');
  if (target.items.some((item) => item.storyId === storyId)) return unchanged('exists');
  if (target.items.length >= COLLECTION_ITEMS_MAX) return unchanged('collectionFull');
  const isSaved = saves.some((save) => save.storyId === storyId);
  if (!isSaved && saves.length >= MAX_GUEST_SAVES) return unchanged('savesFull');
  const addedAt = now.toISOString();
  return {
    outcome: 'added',
    saves: isSaved ? [...saves] : [...saves, { storyId, savedAt: addedAt }],
    collections: collections.map((collection) =>
      collection.id === collectionId
        ? {
            ...collection,
            items: [...collection.items, { storyId, position: collection.items.length, addedAt }],
          }
        : collection,
    ),
  };
}

/** Takes the stories out of one collection and closes the gaps; the saves stay. */
export function removeFromCollection(
  collections: readonly GuestCollection[],
  collectionId: string,
  storyIds: readonly string[],
) {
  return collections.map((collection) =>
    collection.id === collectionId ? withoutStories(collection, storyIds) : collection,
  );
}
