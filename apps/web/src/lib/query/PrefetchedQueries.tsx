import { cache } from 'react';
import type { ReactNode } from 'react';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { makeQueryClient } from './queryClient';

/** One QueryClient per server request, for prefetching in Server Components. It never retries, so a failing API can't delay the HTML; the browser retries instead. */
export const getServerQueryClient = cache(() => makeQueryClient({ retry: 0 }));

/** Hands everything prefetched on `getServerQueryClient()` to the browser cache. */
export function PrefetchedQueries({ children }: { children: ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getServerQueryClient())}>{children}</HydrationBoundary>
  );
}
