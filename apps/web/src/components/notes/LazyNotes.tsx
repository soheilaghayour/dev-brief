'use client';

import dynamic from 'next/dynamic';

// Notes show what the device stores, which the server can't render, so they load after first load and keep /saved and boards under their ceilings.
export const LazyNoteSlot = dynamic(() => import('./NoteSlot').then((module) => module.NoteSlot), {
  ssr: false,
});

export const LazyUnsaveNoteConfirm = dynamic(
  () => import('./UnsaveNoteConfirm').then((module) => module.UnsaveNoteConfirm),
  { ssr: false },
);

export const LazyNoteShortcut = dynamic(
  () => import('./NoteShortcut').then((module) => module.NoteShortcut),
  { ssr: false },
);

export const LazyDigestExportMenu = dynamic(
  () => import('./DigestExportMenu').then((module) => module.DigestExportMenu),
  { ssr: false },
);
