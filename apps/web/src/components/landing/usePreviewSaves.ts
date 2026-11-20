'use client';

import { useEffect, useState } from 'react';

type GuestSaveConnection = Awaited<
  ReturnType<typeof import('./previewGuestSaves').connectGuestSaves>
>;

const NO_SAVES: ReadonlySet<string> = new Set();

// Loaded after the page and outside `useSaves()`, to keep TanStack Query out of the landing JS.
export function usePreviewSaves() {
  const [savedIds, setSavedIds] = useState(NO_SAVES);
  const [connection, setConnection] = useState<GuestSaveConnection | null>(null);

  useEffect(() => {
    let isCancelled = false;
    let connected: GuestSaveConnection | null = null;
    void import('./previewGuestSaves').then(({ connectGuestSaves }) => {
      if (isCancelled) return;
      connected = connectGuestSaves(setSavedIds);
      setConnection(connected);
    });
    return () => {
      isCancelled = true;
      connected?.disconnect();
    };
  }, []);

  return {
    isReady: connection !== null,
    isSaved: (storyId: string) => savedIds.has(storyId),
    toggle: (storyId: string) => connection?.toggle(storyId),
  };
}
