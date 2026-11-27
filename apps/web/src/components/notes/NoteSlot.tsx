'use client';

import { Suspense, useEffect } from 'react';
import { PencilIcon } from 'lucide-react';
import { useSaves } from '@/components/saves/useSaves';
import { focusStory } from '@/components/storyListDom';
import { Button } from '@/components/ui/Button';
import { LazyNoteEditor, preloadNoteEditorWhenIdle } from './LazyNoteEditor';
import { closeNoteEditor, openNoteEditor, useNoteEditing } from './noteEditing';

function firstLine(note: string) {
  return (
    note
      .split('\n')
      .find((line) => line.trim() !== '')
      ?.trim() ?? ''
  );
}

/** Under a saved card: a one-line note preview or "Add note", which open the editor in place. */
export function NoteSlot({ storyId }: { storyId: string }) {
  const { canNote, isSaved, note } = useSaves();
  const isEditing = useNoteEditing((state) => state.storyId === storyId);
  const shown = canNote && isSaved(storyId);

  useEffect(() => {
    if (shown) preloadNoteEditorWhenIdle();
  }, [shown]);

  // Leaving the page takes the slot with it; the open editor must not come back on another page.
  useEffect(
    () => () => {
      if (useNoteEditing.getState().storyId === storyId) closeNoteEditor();
    },
    [storyId],
  );

  function open() {
    openNoteEditor(storyId);
  }
  function close() {
    closeNoteEditor();
    // The editor leaves the page, and focus with it: hand it back to the card.
    requestAnimationFrame(() => focusStory(storyId));
  }

  if (!shown) return null;
  if (isEditing) {
    return (
      <div className="mt-2">
        <Suspense fallback={null}>
          <LazyNoteEditor storyId={storyId} focusOnOpen onDone={close} />
        </Suspense>
      </div>
    );
  }
  const text = note(storyId);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="mt-1 -ml-2.5 max-w-full justify-start"
      title="Edit note"
      aria-label={text ? `Edit note: ${firstLine(text)}` : 'Add note'}
      onClick={open}
    >
      {text ? (
        <span className="truncate">📝 {firstLine(text)}</span>
      ) : (
        <>
          <PencilIcon aria-hidden="true" />
          Add note
        </>
      )}
    </Button>
  );
}
