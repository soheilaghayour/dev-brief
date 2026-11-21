import { create } from 'zustand';

/** What a caller says about the story it toggles; `onUnsave` runs only once an unsave really happens. */
export type ToggleSaveOptions = { title: string; onUnsave?: () => void };

/** `isNoteUnknown`: the note couldn't be looked up, so the story may or may not have one. */
export type UnsaveRequest = ToggleSaveOptions & { storyId: string; isNoteUnknown?: boolean };

/** The unsave waiting for the reader's confirmation, or null. */
export const useUnsaveRequest = create<{ request: UnsaveRequest | null }>(() => ({
  request: null,
}));

export function requestUnsave(request: UnsaveRequest) {
  useUnsaveRequest.setState({ request });
}

export function cancelUnsave() {
  useUnsaveRequest.setState({ request: null });
}
