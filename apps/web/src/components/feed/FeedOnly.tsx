'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Renders its children on the feed only: the shell's search, sort and filter slots mean nothing elsewhere. */
export function FeedOnly({ children }: { children: ReactNode }) {
  return usePathname() === '/feed' ? children : null;
}
