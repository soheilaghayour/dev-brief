'use client';

import { useMemo } from 'react';
import { useMe } from '@/lib/auth/useMe';
import { itemsInOrder, sortCollections } from '@/lib/guest/collectionOrder';
import type { AddItemOutcome, CreateOutcome } from '@/lib/guest/collectionsState';
import { useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { notify } from '@/lib/toast/notify';

export type CollectionView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** The stories in board order. */
  items: { storyId: string; addedAt: string }[];
};

type CreateResult = { outcome: 'created'; id: string } | { outcome: 'full' | 'invalid' };
type RenameResult = 'renamed' | 'invalid' | 'missing';

type Mutations = {
  create: (name: string) => Promise<CreateResult>;
  rename: (id: string, name: string) => Promise<RenameResult>;
  move: (id: string, direction: 'up' | 'down') => Promise<void>;
  remove: (id: string) => Promise<void>;
  addItem: (collectionId: string, storyId: string) => Promise<AddItemOutcome>;
  removeItems: (collectionId: string, storyIds: readonly string[]) => Promise<void>;
};

export type Collections =
  | { status: 'loading' | 'unavailable' }
  | ({
      status: 'ready';
      collections: CollectionView[];
      collectionsOf: (storyId: string) => CollectionView[];
    } & Mutations);

// The writers load on first use, so a page that only reads collections doesn't carry them.
const loadWriters = () => import('@/lib/guest/guestCollections');

/** Fetches the writers and the refusal texts ahead of their first use, so a quick first write waits for no chunk. */
export function preloadCollectionWriters() {
  void loadWriters();
  void import('./collectionNotice');
}

// The refusal texts load with the first refusal, not with every page.
async function announceRefusal(outcome: CreateOutcome | AddItemOutcome) {
  const { collectionNotice } = await import('./collectionNotice');
  const notice = collectionNotice(outcome);
  if (notice) await notify(notice);
}

const guestMutations = {
  async create(name) {
    const { createGuestCollection } = await loadWriters();
    const { outcome, created } = await createGuestCollection(name);
    void announceRefusal(outcome);
    if (outcome === 'created' && created) return { outcome, id: created.id };
    return { outcome: outcome === 'full' ? 'full' : 'invalid' };
  },
  async rename(id, name) {
    return (await loadWriters()).renameGuestCollection(id, name);
  },
  async move(id, direction) {
    await (await loadWriters()).moveGuestCollection(id, direction);
  },
  async remove(id) {
    await (await loadWriters()).deleteGuestCollection(id);
  },
  async addItem(collectionId, storyId) {
    // `now` is taken at click time; the write waits for the stored data to load.
    const outcome = await (
      await loadWriters()
    ).addGuestCollectionItem(collectionId, storyId, new Date());
    void announceRefusal(outcome);
    return outcome;
  },
  async removeItems(collectionId, storyIds) {
    await (await loadWriters()).removeGuestCollectionItems(collectionId, storyIds);
  },
} satisfies Mutations;

function useGuestCollections() {
  const stored = useGuestStore((state) => state.collections);
  return useMemo(
    () =>
      sortCollections(stored).map((collection): CollectionView => ({
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
        items: itemsInOrder(collection).map(({ storyId, addedAt }) => ({ storyId, addedAt })),
      })),
    [stored],
  );
}

/**
 * The one way components read and change collections: this device for a guest; a signed-in user's collections
 * are unavailable until account sync exists, so the collections UI hides itself.
 */
export function useCollections(): Collections {
  const { data: user, isPending } = useMe();
  const isGuestReady = useGuestReady((state) => state.ready);
  const collections = useGuestCollections();

  return useMemo((): Collections => {
    if (user) return { status: 'unavailable' };
    // Waiting for /me avoids treating someone about to be recognised as signed in as a guest.
    if (isPending || !isGuestReady) return { status: 'loading' };
    return {
      status: 'ready',
      collections,
      collectionsOf: (storyId) =>
        collections.filter(({ items }) => items.some((item) => item.storyId === storyId)),
      ...guestMutations,
    };
  }, [user, isPending, isGuestReady, collections]);
}
