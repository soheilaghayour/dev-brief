'use client';

import { lazy } from 'react';

// The editor loads on first open or edit, never with a page's first-load JS.
const loadEditor = () => import('./NoteEditor');

/** The note editor as a lazy component; render it inside Suspense. */
export const LazyNoteEditor = lazy(() =>
  loadEditor().then((module) => ({ default: module.NoteEditor })),
);

let preloading = false;

/** Fetches the editor when the browser is idle, so the first click doesn't wait for the chunk. */
export function preloadNoteEditorWhenIdle() {
  if (preloading) return;
  preloading = true;
  function preload() {
    void loadEditor();
  }
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(preload);
  else window.setTimeout(preload, 200);
}
