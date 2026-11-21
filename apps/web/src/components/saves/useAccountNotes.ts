'use client';

import { useQueryClient } from '@tanstack/react-query';
import { findCachedNote } from './accountNoteCache';

type NoteWriter = typeof import('./accountNotes');
let noteWriter: NoteWriter | undefined;

// The writer (and Zod with the endpoints) loads when an editor opens, so a write as the page closes needn't wait for it.
const loadWriter = () => import('./accountNotes');

function prepareNoteWrites() {
  void loadWriter().then((module) => {
    noteWriter = module;
  });
}

/** Notes kept in the account, read from the caches and written optimistically; a surface that shows them subscribes with `useNotesVersion`. */
export function useAccountNotes() {
  const queryClient = useQueryClient();

  function note(storyId: string) {
    return findCachedNote(queryClient, storyId)?.note ?? null;
  }
  function savedAt(storyId: string) {
    return findCachedNote(queryClient, storyId)?.savedAt ?? null;
  }
  async function setNote(storyId: string, markdown: string | null) {
    const writer = noteWriter ?? (await loadWriter());
    return writer.writeAccountNote(queryClient, storyId, markdown);
  }
  // Synchronous, for a page that is closing; does nothing when the writer hasn't loaded yet.
  function setNoteNow(storyId: string, markdown: string | null) {
    noteWriter?.writeAccountNoteNow(queryClient, storyId, markdown);
  }

  return { note, savedAt, setNote, setNoteNow, prepareNoteWrites };
}
