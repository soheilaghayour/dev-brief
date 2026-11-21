import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { SaveNotePatchSchema, type Save } from '@devbrief/shared';
import { COLLECTIONS_KEY } from '@/components/collections/collectionKeys';
import { ApiError } from '@/lib/api/apiError';
import { patchSaveNote } from '@/lib/api/endpoints';
import { isBoard, isBoardKey, noteKey } from './accountNoteCache';
import { SAVE_LIST_KEY } from './accountSaves';

export type AccountNoteOutcome = 'saved' | 'removed' | 'too-long' | 'not-saved' | 'failed';

type NoteFields = Pick<Save, 'note' | 'noteUpdatedAt'>;

// Writes leave in the order they were made, so an older text can't land after a newer one.
let requestTail: Promise<unknown> = Promise.resolve();
function inOrder<T>(request: () => Promise<T>) {
  const run = requestTail.then(request);
  requestTail = run.catch(() => undefined);
  return run;
}

const writesInFlight = new Map<string, number>();
/** The text last asked for per story; `fromUnload` marks one sent by a request that may reach the server before an older one. */
const newest = new Map<string, { note: string | null; fromUnload: boolean }>();
/** The entries a write cancelled, refetched once no write is left in flight. */
const cancelled = new Map<string, QueryKey>();

function countWrite(storyId: string, change: 1 | -1) {
  writesInFlight.set(storyId, (writesInFlight.get(storyId) ?? 0) + change);
}

function isAnyWriteInFlight() {
  return [...writesInFlight.values()].some((count) => count > 0);
}

function fieldsOf(save: Save): NoteFields {
  return { note: save.note ?? null, noteUpdatedAt: save.noteUpdatedAt ?? null };
}

/** The story's note as one cache entry holds it, or undefined when the entry doesn't hold the story. */
function noteIn(data: unknown, storyId: string): NoteFields | undefined {
  if (isBoard(data)) {
    const item = data.items.find((candidate) => candidate.story.id === storyId);
    return item && { note: item.note, noteUpdatedAt: item.noteUpdatedAt ?? null };
  }
  if (typeof data !== 'object' || data === null) return undefined;
  if ('pages' in data) {
    for (const page of (data as SavedListData).pages) {
      const item = page.items.find((candidate) => candidate.story.id === storyId);
      if (item) return { note: item.note ?? null, noteUpdatedAt: item.noteUpdatedAt ?? null };
    }
    return undefined;
  }
  return 'storyId' in data ? fieldsOf(data as Save) : undefined;
}

type SavedListData = {
  pages: { items: ({ story: { id: string } } & NoteFields)[] }[];
};

function withNote(data: unknown, storyId: string, value: NoteFields): unknown {
  if (isBoard(data)) {
    return {
      ...data,
      items: data.items.map((item) =>
        item.story.id === storyId
          ? { ...item, note: value.note ?? null, noteUpdatedAt: value.noteUpdatedAt ?? null }
          : item,
      ),
    };
  }
  if (typeof data !== 'object' || data === null) return data;
  if ('pages' in data) {
    const list = data as SavedListData;
    return {
      ...list,
      pages: list.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.story.id === storyId ? { ...item, ...value } : item)),
      })),
    };
  }
  return 'storyId' in data ? { ...data, ...value } : data;
}

/** The cache entries a note write can change: the story's own save, the saved list and the loaded boards. */
function noteEntries(queryClient: QueryClient, storyId: string): QueryKey[] {
  const cache = queryClient.getQueryCache();
  const own = [noteKey(storyId), SAVE_LIST_KEY].filter((queryKey) =>
    cache.find({ queryKey, exact: true }),
  );
  const boards = queryClient
    .getQueriesData({ queryKey: COLLECTIONS_KEY })
    .filter(([queryKey, data]) => isBoardKey(queryKey) && noteIn(data, storyId) !== undefined)
    .map(([queryKey]) => queryKey);
  return [...own, ...boards];
}

/** Writes a story's note into every cache that holds it. */
function patchCachedNote(queryClient: QueryClient, storyId: string, value: NoteFields) {
  for (const queryKey of noteEntries(queryClient, storyId)) {
    queryClient.setQueryData(queryKey, (data: unknown) =>
      data === undefined ? data : withNote(data, storyId, value),
    );
  }
}

type NoteSnapshot = { queryKey: QueryKey; fields: NoteFields }[];

/** The story's own note fields in each entry, to put back on failure without touching anything else in the entry. */
function snapshotNote(queryClient: QueryClient, storyId: string): NoteSnapshot {
  return noteEntries(queryClient, storyId).flatMap((queryKey) => {
    const fields = noteIn(queryClient.getQueryData(queryKey), storyId);
    return fields ? [{ queryKey, fields }] : [];
  });
}

function restoreNote(queryClient: QueryClient, storyId: string, snapshot: NoteSnapshot) {
  for (const { queryKey, fields } of snapshot) {
    queryClient.setQueryData(queryKey, (data: unknown) =>
      data === undefined ? data : withNote(data, storyId, fields),
    );
  }
}

/** Stops the loads of exactly the entries about to be patched, so a stale answer can't land over the note. */
async function cancelEntries(queryClient: QueryClient, storyId: string) {
  const loading = noteEntries(queryClient, storyId).filter(
    (queryKey) => queryClient.isFetching({ queryKey, exact: true }) > 0,
  );
  await Promise.all(
    loading.map((queryKey) => {
      cancelled.set(hashKey(queryKey), queryKey);
      return queryClient.cancelQueries({ queryKey, exact: true });
    }),
  );
}

function refetchCancelled(queryClient: QueryClient) {
  if (isAnyWriteInFlight()) return;
  const keys = [...cancelled.values()];
  cancelled.clear();
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey, exact: true });
}

/** Writes a note optimistically (PRD §7.5): the caches show it at once, and a failed write puts back this story's note; "" counts as no note. */
export async function writeAccountNote(
  queryClient: QueryClient,
  storyId: string,
  markdown: string | null,
): Promise<AccountNoteOutcome> {
  const patch = SaveNotePatchSchema.safeParse({ note: markdown === '' ? null : markdown });
  if (!patch.success) return 'too-long';
  const { note } = patch.data;
  countWrite(storyId, 1);
  newest.set(storyId, { note, fromUnload: false });
  try {
    await cancelEntries(queryClient, storyId);
    const snapshot = snapshotNote(queryClient, storyId);
    patchCachedNote(queryClient, storyId, { note, noteUpdatedAt: new Date().toISOString() });
    try {
      const saved = await inOrder(() => patchSaveNote(storyId, { note }));
      await settle(queryClient, storyId, note, fieldsOf(saved));
      return note === null ? 'removed' : 'saved';
    } catch (error) {
      // A newer write's patch must not be undone by this one's snapshot.
      if ((writesInFlight.get(storyId) ?? 0) === 1) restoreNote(queryClient, storyId, snapshot);
      return error instanceof ApiError && error.status === 404 ? 'not-saved' : 'failed';
    }
  } finally {
    countWrite(storyId, -1);
    refetchCancelled(queryClient);
  }
}

// What the server answered shows only while it is still the newest text; a request sent as the page closed may
// have overtaken this one, so the newest text is sent once more behind it.
async function settle(
  queryClient: QueryClient,
  storyId: string,
  note: string | null,
  answer: NoteFields,
) {
  const latest = newest.get(storyId);
  if (!latest || latest.note === note) {
    patchCachedNote(queryClient, storyId, answer);
    return;
  }
  if (!latest.fromUnload) return;
  try {
    const resent = await inOrder(() => patchSaveNote(storyId, { note: latest.note }));
    patchCachedNote(queryClient, storyId, fieldsOf(resent));
  } catch {
    // The request sent as the page closed may have landed; the next load shows what the server holds.
  }
}

/** For a page that is closing: sends the note without waiting, in a request that outlives the page. */
export function writeAccountNoteNow(
  queryClient: QueryClient,
  storyId: string,
  markdown: string | null,
) {
  const patch = SaveNotePatchSchema.safeParse({ note: markdown === '' ? null : markdown });
  if (!patch.success) return;
  newest.set(storyId, { note: patch.data.note, fromUnload: true });
  patchCachedNote(queryClient, storyId, {
    note: patch.data.note,
    noteUpdatedAt: new Date().toISOString(),
  });
  void patchSaveNote(storyId, patch.data, { keepalive: true }).catch(() => undefined);
}
