import type { QueryClient } from '@tanstack/react-query';
import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  CollectionNameSchema,
  collectionSlug,
  type Collection,
  type CollectionDetail,
  type CollectionList,
  type SaveIds,
} from '@devbrief/shared';
import { patchSaveIds, SAVE_IDS_KEY } from '@/components/saves/accountSaves';
import type { AddItemOutcome } from '@/lib/guest/collectionsState';
import { notify } from '@/lib/toast/notify';
import {
  collectionKey,
  COLLECTIONS_KEY,
  detailRenamed,
  detailWithoutItems,
  listItemCount,
  listMoved,
  listRenamed,
  listWithCreated,
  listWithout,
  listWithReplaced,
  pendingCollectionId,
} from './accountCollections';

export const COLLECTION_FAILED_NOTICE = "Couldn't update your collections — retry";

type Api = typeof import('@/lib/api/endpoints');
const loadApi = (): Promise<Api> => import('@/lib/api/endpoints');

// Requests leave in the order the user acted, so a rename and a move can't reach the server reversed.
let requestTail: Promise<unknown> = Promise.resolve();
function inOrder<T>(request: () => Promise<T>) {
  const run = requestTail.then(request);
  requestTail = run.catch(() => undefined);
  return run;
}

let inFlight = 0;
let pendingCount = 0;

type Snapshot = { collections: [readonly unknown[], unknown][]; saveIds: SaveIds | undefined };

function takeSnapshot(queryClient: QueryClient): Snapshot {
  return {
    collections: queryClient.getQueriesData({ queryKey: COLLECTIONS_KEY }),
    saveIds: queryClient.getQueryData<SaveIds>(SAVE_IDS_KEY),
  };
}

function restore(queryClient: QueryClient, { collections, saveIds }: Snapshot) {
  for (const [key, data] of collections) queryClient.setQueryData(key, data);
  queryClient.setQueryData(SAVE_IDS_KEY, saveIds);
}

type Result<T> = { ok: true; value: T } | { ok: false };

/**
 * The optimistic pattern (PRD §7.5): cancel, snapshot, patch; roll back with a toast on error; refetch once the
 * last change settles. A rollback is skipped while another change is in flight, since its snapshot would undo that one's patch.
 */
async function optimistic<T>(
  queryClient: QueryClient,
  patch: () => void,
  request: () => Promise<T>,
  { refreshSaves = false } = {},
): Promise<Result<T>> {
  await queryClient.cancelQueries({ queryKey: COLLECTIONS_KEY });
  const snapshot = takeSnapshot(queryClient);
  inFlight += 1;
  patch();
  try {
    return { ok: true, value: await inOrder(request) };
  } catch {
    if (inFlight === 1) restore(queryClient, snapshot);
    void notify(COLLECTION_FAILED_NOTICE);
    return { ok: false };
  } finally {
    inFlight -= 1;
    if (inFlight === 0) {
      // Awaited, so a caller that shows what the cache holds sees the server's answer.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: COLLECTIONS_KEY }),
        refreshSaves ? queryClient.invalidateQueries({ queryKey: ['saves'] }) : undefined,
      ]);
    }
  }
}

function cachedList(queryClient: QueryClient) {
  return queryClient.getQueryData<CollectionList>(COLLECTIONS_KEY);
}

function cachedDetail(queryClient: QueryClient, id: string) {
  return queryClient.getQueryData<CollectionDetail>(collectionKey(id));
}

function setList(
  queryClient: QueryClient,
  change: (list: CollectionList | undefined) => CollectionList | undefined,
) {
  queryClient.setQueryData<CollectionList>(COLLECTIONS_KEY, change);
}

export async function createAccountCollection(queryClient: QueryClient, name: string) {
  const parsed = CollectionNameSchema.safeParse(name);
  if (!parsed.success) return { outcome: 'invalid' as const };
  const existing = cachedList(queryClient)?.items ?? [];
  if (existing.length >= COLLECTIONS_MAX) return { outcome: 'full' as const };

  const now = new Date().toISOString();
  const pendingId = pendingCollectionId((pendingCount += 1));
  // The slug the server will give, so the board link of a pending row is already the real one.
  const pending: Collection = {
    id: pendingId,
    slug: collectionSlug(
      parsed.data,
      existing.map(({ slug }) => slug),
    ),
    name: parsed.data,
    description: null,
    position: existing.length,
    itemCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const result = await optimistic(
    queryClient,
    () => setList(queryClient, (list) => listWithCreated(list, pending)),
    async () => {
      const { createCollection } = await loadApi();
      const created = await createCollection({ name: parsed.data });
      setList(queryClient, (list) => listWithReplaced(list, pendingId, created));
      return created;
    },
  );
  return result.ok
    ? { outcome: 'created' as const, id: result.value.id }
    : { outcome: 'failed' as const };
}

export async function renameAccountCollection(queryClient: QueryClient, id: string, name: string) {
  const parsed = CollectionNameSchema.safeParse(name);
  if (!parsed.success) return 'invalid' as const;
  if (!cachedList(queryClient)?.items.some((collection) => collection.id === id))
    return 'missing' as const;
  const result = await optimistic(
    queryClient,
    () => {
      setList(queryClient, (list) => listRenamed(list, id, parsed.data));
      queryClient.setQueryData<CollectionDetail>(collectionKey(id), (detail) =>
        detailRenamed(detail, parsed.data),
      );
    },
    async () => (await loadApi()).updateCollection(id, { name: parsed.data }),
  );
  return result.ok ? ('renamed' as const) : ('failed' as const);
}

export async function moveAccountCollection(
  queryClient: QueryClient,
  id: string,
  direction: 'up' | 'down',
) {
  const items = cachedList(queryClient)?.items ?? [];
  const index = items.findIndex((collection) => collection.id === id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= items.length) return;
  await optimistic(
    queryClient,
    () => setList(queryClient, (list) => listMoved(list, id, target)),
    async () => (await loadApi()).updateCollection(id, { position: target }),
  );
}

export async function deleteAccountCollection(queryClient: QueryClient, id: string) {
  await optimistic(
    queryClient,
    () => setList(queryClient, (list) => listWithout(list, id)),
    async () => (await loadApi()).deleteCollection(id),
  );
}

export async function addAccountCollectionItem(
  queryClient: QueryClient,
  id: string,
  storyId: string,
): Promise<AddItemOutcome | 'failed'> {
  const collection = cachedList(queryClient)?.items.find((candidate) => candidate.id === id);
  if (!collection) return 'missing';
  const detail = cachedDetail(queryClient, id);
  if (detail?.items.some((item) => item.story.id === storyId)) return 'exists';
  if (collection.itemCount >= COLLECTION_ITEMS_MAX) return 'collectionFull';

  const savedIds = queryClient.getQueryData<SaveIds>(SAVE_IDS_KEY);
  // The server saves the story too (PRD §6.4.1 row 28), so the saved state follows at once.
  const savesToo = savedIds !== undefined && !savedIds.ids.includes(storyId);
  const result = await optimistic(
    queryClient,
    () => {
      setList(queryClient, (list) => listItemCount(list, id, 1));
      if (savesToo)
        queryClient.setQueryData<SaveIds>(SAVE_IDS_KEY, (ids) =>
          patchSaveIds(ids, { storyId, save: true }),
        );
    },
    async () => (await loadApi()).putCollectionItem(id, storyId),
    { refreshSaves: savesToo },
  );
  return result.ok ? 'added' : 'failed';
}

export async function removeAccountCollectionItems(
  queryClient: QueryClient,
  id: string,
  storyIds: readonly string[],
) {
  if (storyIds.length === 0) return;
  await optimistic(
    queryClient,
    () => {
      const detail = cachedDetail(queryClient, id);
      const present = detail
        ? detail.items.filter((item) => storyIds.includes(item.story.id)).length
        : storyIds.length;
      setList(queryClient, (list) => listItemCount(list, id, -present));
      queryClient.setQueryData<CollectionDetail>(collectionKey(id), (current) =>
        detailWithoutItems(current, storyIds),
      );
    },
    async () => {
      const { deleteCollectionItem } = await loadApi();
      for (const storyId of storyIds) await deleteCollectionItem(id, storyId);
    },
  );
}
