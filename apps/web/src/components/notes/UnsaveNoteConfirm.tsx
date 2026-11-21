'use client';

import { lazy, Suspense } from 'react';
import { useUnsaveRequest } from '@/components/saves/unsaveRequest';

// The dialog (and Radix Dialog with it) is fetched the first time a confirmation is needed.
const UnsaveNoteDialog = lazy(() =>
  import('./UnsaveNoteDialog').then((module) => ({ default: module.UnsaveNoteDialog })),
);

/** Mounted once in the app layout: shows the confirmation when unsaving a story that has a note. */
export function UnsaveNoteConfirm() {
  const request = useUnsaveRequest((state) => state.request);
  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <UnsaveNoteDialog request={request} />
    </Suspense>
  );
}
