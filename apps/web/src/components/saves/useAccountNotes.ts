'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { findCachedNote, isNoteQueryKey } from './accountNoteCache';

type NoteWriter = typeof import('./accountNotes');
let noteWriter: NoteWriter | undefined;

// The writer (and Zod with the endpoints) loads when an editor opens, so a write as the page closes needn't wait for it.
const loadWriter = () => import('./accountNotes');

function prepareNoteWrites() {
  void loadWriter().then((module) => {
    noteWriter = module;
  });
}

/** Notes kept in the account, read from whatever the caches hold (saved list, boards, the story's own save) and written optimistically. */
export function useAccountNotes() {
  const queryClient = useQueryClient();
  // Reads go straight to the caches, so a change to one has to re-render the components that read.
  const changes = useRef(0);
  const subscribe = useCallback(
    (onChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        // Only a change to what a cache holds, not the bookkeeping of a fetch starting.
        const isDataChange =
          event.type === 'removed' || (event.type === 'updated' && event.action.type === 'success');
        if (!isDataChange || !isNoteQueryKey(event.query.queryKey)) return;
        changes.current += 1;
        onChange();
      }),
    [queryClient],
  );
  useSyncExternalStore(
    subscribe,
    () => changes.current,
    () => 0,
  );

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
