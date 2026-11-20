'use client';

import { useEffect, useState } from 'react';

type GuestSaveConnection = Awaited<
  ReturnType<typeof import('./previewGuestSaves').connectGuestSaves>
>;

const NO_SAVES: ReadonlySet<string> = new Set();

// The guest store (zustand, Zod parsing) loads after the page instead of inside first-load JS.
// It stays out of the mode hooks (`useSaves`) because those pull TanStack Query, which the static
// landing page does not ship; the visitor here is a guest by definition.
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
