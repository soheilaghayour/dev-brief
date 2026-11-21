import type { QueryClient } from '@tanstack/react-query';
import { SaveNotePatchSchema, type Save } from '@devbrief/shared';
import { COLLECTIONS_KEY } from '@/components/collections/accountCollections';
import { ApiError } from '@/lib/api/apiError';
import { patchSaveNote } from '@/lib/api/endpoints';
import { SAVE_LIST_KEY } from './accountSaves';
import {
  noteKey,
  patchCachedNote,
  restoreNotes,
  snapshotNotes,
  type NoteValue,
} from './accountNoteCache';

export type AccountNoteOutcome = 'saved' | 'removed' | 'too-long' | 'not-saved' | 'failed';

// Writes of one story leave in the order they were made, so an older text can't land after a newer one.
let requestTail: Promise<unknown> = Promise.resolve();
function inOrder<T>(request: () => Promise<T>) {
  const run = requestTail.then(request);
  requestTail = run.catch(() => undefined);
  return run;
}

const writesInFlight = new Map<string, number>();

function countWrite(storyId: string, change: 1 | -1) {
  writesInFlight.set(storyId, (writesInFlight.get(storyId) ?? 0) + change);
}

function valueOf(save: Save): NoteValue {
  return { note: save.note ?? null, noteUpdatedAt: save.noteUpdatedAt ?? null };
}

/**
 * Writes a note optimistically (PRD §7.5): the caches show it at once, and a failed write puts them back. The text
 * stays in the editor, which retries, so a failure never costs what was typed. "" counts as no note.
 */
export async function writeAccountNote(
  queryClient: QueryClient,
  storyId: string,
  markdown: string | null,
): Promise<AccountNoteOutcome> {
  const patch = SaveNotePatchSchema.safeParse({ note: markdown === '' ? null : markdown });
  if (!patch.success) return 'too-long';
  const { note } = patch.data;
  await Promise.all([
    queryClient.cancelQueries({ queryKey: noteKey(storyId) }),
    queryClient.cancelQueries({ queryKey: SAVE_LIST_KEY }),
    queryClient.cancelQueries({ queryKey: COLLECTIONS_KEY }),
  ]);
  const snapshot = snapshotNotes(queryClient);
  countWrite(storyId, 1);
  patchCachedNote(queryClient, storyId, { note, noteUpdatedAt: new Date().toISOString() });
  try {
    const saved = await inOrder(() => patchSaveNote(storyId, { note }));
    patchCachedNote(queryClient, storyId, valueOf(saved));
    return note === null ? 'removed' : 'saved';
  } catch (error) {
    // A newer write's patch must not be undone by this one's snapshot.
    if ((writesInFlight.get(storyId) ?? 0) === 1) restoreNotes(queryClient, snapshot);
    return error instanceof ApiError && error.status === 404 ? 'not-saved' : 'failed';
  } finally {
    countWrite(storyId, -1);
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
  patchCachedNote(queryClient, storyId, {
    note: patch.data.note,
    noteUpdatedAt: new Date().toISOString(),
  });
  void patchSaveNote(storyId, patch.data, { keepalive: true }).catch(() => undefined);
}
