'use client';

import { useSaves } from '@/components/saves/useSaves';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';
import { openNoteEditor } from './noteEditing';

const EDIT_NOTE = {
  id: 'edit-note',
  keys: 'n',
  description: 'Write a note on the story',
  scope: 'Notes',
} satisfies Shortcut;

function BoundShortcut({ storyId }: { storyId: string }) {
  function openForStory() {
    openNoteEditor(storyId);
  }

  useShortcut(EDIT_NOTE, openForStory);
  return null;
}

/** Binds `n` to the active saved card, and lists it in the help only where notes are usable. */
export function NoteShortcut({ storyId }: { storyId: string | null }) {
  const { canNote, isSaved } = useSaves();
  return canNote && storyId && isSaved(storyId) ? <BoundShortcut storyId={storyId} /> : null;
}
