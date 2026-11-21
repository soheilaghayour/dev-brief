'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { CollectionDetail } from '@devbrief/shared';
import { useMe } from '@/lib/auth/useMe';
import { itemsInOrder, sortCollections } from '@/lib/guest/collectionOrder';
import type { AddItemOutcome, CreateOutcome } from '@/lib/guest/collectionsState';
import { useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { notify } from '@/lib/toast/notify';
import { useQueryCacheVersion } from '@/lib/useQueryCacheVersion';
import { collectionKey, COLLECTIONS_KEY } from './accountCollections';

export type CollectionView = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** How many stories the collection holds; for an account collection the count is known before its items are. */
  itemCount: number;
  /** The stories in board order; an account collection's are empty until `useCollectionItems` has loaded them. */
  items: { storyId: string; addedAt: string }[];
};

type CreateResult = { outcome: 'created'; id: string } | { outcome: 'full' | 'invalid' | 'failed' };
type RenameResult = 'renamed' | 'invalid' | 'missing' | 'failed';

type Mutations = {
  create: (name: string) => Promise<CreateResult>;
  rename: (id: string, name: string) => Promise<RenameResult>;
  move: (id: string, direction: 'up' | 'down') => Promise<void>;
  remove: (id: string) => Promise<void>;
  addItem: (collectionId: string, storyId: string) => Promise<AddItemOutcome | 'failed'>;
  removeItems: (collectionId: string, storyIds: readonly string[]) => Promise<void>;
};

export type Collections =
  | { status: 'loading' }
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
async function announceRefusal(outcome: CreateOutcome | AddItemOutcome | 'failed') {
  if (outcome === 'failed') return;
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
        itemCount: collection.items.length,
        items: itemsInOrder(collection).map(({ storyId, addedAt }) => ({ storyId, addedAt })),
      })),
    [stored],
  );
}

// The account's writers (and Zod with the endpoints) load on the first change, not with the page.
const loadAccountWriters = () => import('./accountCollectionWriters');

function accountMutations(queryClient: QueryClient) {
  return {
    async create(name) {
      const { createAccountCollection } = await loadAccountWriters();
      const result = await createAccountCollection(queryClient, name);
      void announceRefusal(result.outcome);
      return result;
    },
    async rename(id, name) {
      return (await loadAccountWriters()).renameAccountCollection(queryClient, id, name);
    },
    async move(id, direction) {
      await (await loadAccountWriters()).moveAccountCollection(queryClient, id, direction);
    },
    async remove(id) {
      await (await loadAccountWriters()).deleteAccountCollection(queryClient, id);
    },
    async addItem(collectionId, storyId) {
      const outcome = await (
        await loadAccountWriters()
      ).addAccountCollectionItem(queryClient, collectionId, storyId);
      void announceRefusal(outcome);
      return outcome;
    },
    async removeItems(collectionId, storyIds) {
      await (
        await loadAccountWriters()
      ).removeAccountCollectionItems(queryClient, collectionId, storyIds);
    },
  } satisfies Mutations;
}

async function fetchCollections() {
  return (await import('@/lib/api/endpoints')).getCollections();
}

function isCollectionQueryKey(queryKey: QueryKey) {
  return queryKey[0] === 'collections';
}

/** The account's collections: the list from the API, and the items of each board once something has loaded it. */
function useAccountCollections(enabled: boolean) {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: COLLECTIONS_KEY, queryFn: fetchCollections, enabled });
  // The boards are read from the cache, not observed: `useQueries` is too heavy for first-load JS.
  const boardsVersion = useQueryCacheVersion(isCollectionQueryKey);
  const rows = list.data?.items;
  const collections = useMemo(
    () =>
      (rows ?? []).map((row): CollectionView => {
        const board = queryClient.getQueryData<CollectionDetail>(collectionKey(row.id));
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          itemCount: row.itemCount,
          items: (board?.items ?? []).map(({ story, addedAt }) => ({
            storyId: story.id,
            addedAt,
          })),
        };
      }),
    // `boardsVersion` signals that a board in the cache changed.
    [rows, queryClient, boardsVersion],
  );
  return { isLoading: enabled && list.isPending, collections };
}

/** The one way components read and change collections: the account's when signed in, this device's otherwise. */
export function useCollections(): Collections {
  const queryClient = useQueryClient();
  const { data: user, isPending } = useMe();
  const isGuestReady = useGuestReady((state) => state.ready);
  const guest = useGuestCollections();
  const isAccount = Boolean(user);
  const account = useAccountCollections(isAccount);
  const collections = isAccount ? account.collections : guest;
  // Waiting for /me avoids treating someone about to be recognised as signed in as a guest.
  const isLoading = isAccount ? account.isLoading : isPending || !isGuestReady;

  return useMemo((): Collections => {
    if (isLoading) return { status: 'loading' };
    return {
      status: 'ready',
      collections,
      collectionsOf: (storyId) =>
        collections.filter(({ items }) => items.some((item) => item.storyId === storyId)),
      ...(isAccount ? accountMutations(queryClient) : guestMutations),
    };
  }, [isLoading, isAccount, collections, queryClient]);
}
