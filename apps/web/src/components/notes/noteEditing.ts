import { create } from 'zustand';

/** The story whose note editor is open on the page, or null; one at a time, so `n` and the buttons agree. */
export const useNoteEditing = create<{ storyId: string | null }>(() => ({ storyId: null }));

export function openNoteEditor(storyId: string) {
  useNoteEditing.setState({ storyId });
}

export function closeNoteEditor() {
  useNoteEditing.setState({ storyId: null });
}
