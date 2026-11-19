import { cache } from 'react';
import type { ReactNode } from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { makeQueryClient } from './queryClient';

/** One QueryClient per server request, for prefetching in Server Components. */
export const getServerQueryClient = cache(makeQueryClient);

/** Hands everything prefetched on `getServerQueryClient()` to the browser cache. */
export function PrefetchedQueries({ children }: { children: ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getServerQueryClient())}>{children}</HydrationBoundary>
  );
}
