'use client';

import { lazy, Suspense } from 'react';
import { useUnsaveRequest } from './unsaveRequest';

// The dialog (and Radix Dialog with it) is fetched the first time a confirmation is needed.
const UnsaveNoteDialog = lazy(() =>
  import('./UnsaveNoteDialog').then((module) => ({ default: module.UnsaveNoteDialog })),
);

/** Mounted once in the app layout: shows the confirmation when unsaving a story that has a note. */
export function UnsaveNoteConfirm() {
  const storyId = useUnsaveRequest((state) => state.storyId);
  if (!storyId) return null;
  return (
    <Suspense fallback={null}>
      <UnsaveNoteDialog storyId={storyId} />
    </Suspense>
  );
}
