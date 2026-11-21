let flushOpenEditor: (() => Promise<void>) | null = null;

/** Lets the open note editor hand over text it hasn't written yet; returns the unregister. */
export function registerPendingNote(flush: () => Promise<void>) {
  flushOpenEditor = flush;
  return () => {
    if (flushOpenEditor === flush) flushOpenEditor = null;
  };
}

/** Writes the open editor's pending text, so a decision about a note sees what the reader just typed. */
export async function flushPendingNote() {
  await flushOpenEditor?.();
}
