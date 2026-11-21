let flushOpenEditor: (() => Promise<void>) | null = null;

/** Lets the open note editor hand over text it hasn't written yet; returns the unregister. */
export function registerPendingNote(flush: () => Promise<void>) {
  flushOpenEditor = flush;
  return () => {
    if (flushOpenEditor === flush) flushOpenEditor = null;
  };
}

// The text of a write that failed, per story, so an editor that is closed and reopened still holds what was typed.
const failedTexts = new Map<string, string>();

export function rememberFailedNote(storyId: string, text: string) {
  failedTexts.set(storyId, text);
}

export function failedNote(storyId: string) {
  return failedTexts.get(storyId);
}

export function forgetFailedNote(storyId: string) {
  failedTexts.delete(storyId);
}

export function forgetAllFailedNotes() {
  failedTexts.clear();
}

/** Writes the open editor's pending text, so a decision about a note sees what the reader just typed. */
export async function flushPendingNote() {
  await flushOpenEditor?.();
}
