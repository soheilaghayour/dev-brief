'use client';

import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Renders its children on the feed only: the shell's search, sort and filter slots mean nothing elsewhere. */
export function FeedOnly({ children }: { children: ReactNode }) {
  // The slots read the URL's search params, which a statically rendered page can't supply; /feed itself renders per request.
  return usePathname() === '/feed' ? <Suspense fallback={null}>{children}</Suspense> : null;
}
