import { create } from 'zustand';

/** The story whose unsave waits for the reader's confirmation, or null. */
export const useUnsaveRequest = create<{ storyId: string | null }>(() => ({ storyId: null }));

export function requestUnsave(storyId: string) {
  useUnsaveRequest.setState({ storyId });
}

export function cancelUnsave() {
  useUnsaveRequest.setState({ storyId: null });
}
