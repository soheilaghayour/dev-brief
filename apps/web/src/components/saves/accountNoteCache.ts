import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import type { CollectionDetail, Save, SavedStoryPage } from '@devbrief/shared';
import { COLLECTIONS_KEY } from '@/components/collections/accountCollections';
import { SAVE_LIST_KEY } from './accountSaves';

type SavedList = InfiniteData<SavedStoryPage, string | undefined>;

/** One save with its note, loaded for the story page; the saved list and the boards carry notes too. */
export function noteKey(storyId: string) {
  return ['saves', 'note', storyId] as const;
}

export type NoteValue = Pick<Save, 'note' | 'noteUpdatedAt'>;

// A board's cache entry is `['collections', id]`; the list and the pending-free keys are shorter.
function isBoardKey(queryKey: QueryKey) {
  return queryKey.length === 2;
}

function isBoard(data: unknown): data is CollectionDetail {
  return typeof data === 'object' && data !== null && 'collection' in data && 'items' in data;
}

/** The note the account's caches hold for a story: the one-save entry first, then the saved list, then the boards. */
export function findCachedNote(
  queryClient: QueryClient,
  storyId: string,
): { savedAt: string | null; note: string | null } | undefined {
  const own = queryClient.getQueryData<Save>(noteKey(storyId));
  if (own) return { savedAt: own.savedAt, note: own.note ?? null };
  const list = queryClient.getQueryData<SavedList>(SAVE_LIST_KEY);
  for (const page of list?.pages ?? []) {
    const item = page.items.find((candidate) => candidate.story.id === storyId);
    if (item) return { savedAt: item.savedAt, note: item.note ?? null };
  }
  for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: COLLECTIONS_KEY })) {
    if (!isBoardKey(queryKey) || !isBoard(data)) continue;
    const item = data.items.find((candidate) => candidate.story.id === storyId);
    if (item) return { savedAt: null, note: item.note };
  }
  return undefined;
}

/** Writes a story's note into every cache that holds it. */
export function patchCachedNote(queryClient: QueryClient, storyId: string, value: NoteValue) {
  queryClient.setQueryData<Save>(noteKey(storyId), (save) => save && { ...save, ...value });
  queryClient.setQueryData<SavedList>(
    SAVE_LIST_KEY,
    (list) =>
      list && {
        ...list,
        pages: list.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.story.id === storyId ? { ...item, ...value } : item,
          ),
        })),
      },
  );
  queryClient.setQueriesData<unknown>({ queryKey: COLLECTIONS_KEY }, (data: unknown) =>
    isBoard(data)
      ? {
          ...data,
          items: data.items.map((item) =>
            item.story.id === storyId
              ? { ...item, note: value.note ?? null, noteUpdatedAt: value.noteUpdatedAt ?? null }
              : item,
          ),
        }
      : data,
  );
}

export type NoteSnapshot = [QueryKey, unknown][];

const NOTE_KEY_PREFIX = ['saves', 'note'] as const;

/** Every cache entry a note write can patch, to put back when the write fails. */
export function snapshotNotes(queryClient: QueryClient): NoteSnapshot {
  return [
    ...queryClient.getQueriesData({ queryKey: NOTE_KEY_PREFIX }),
    ...queryClient.getQueriesData({ queryKey: SAVE_LIST_KEY }),
    ...queryClient
      .getQueriesData({ queryKey: COLLECTIONS_KEY })
      .filter(([queryKey]) => isBoardKey(queryKey)),
  ];
}

export function restoreNotes(queryClient: QueryClient, snapshot: NoteSnapshot) {
  for (const [queryKey, data] of snapshot) queryClient.setQueryData(queryKey, data);
}

/** Whether a cache event can change what a note reads show. */
export function isNoteQueryKey(queryKey: QueryKey) {
  return queryKey[0] === 'saves' || queryKey[0] === 'collections';
}
