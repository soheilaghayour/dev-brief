'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/**
 * A number that changes whenever data in a matching cache entry changes, so a component that reads the cache directly
 * (without an observer, which would cost `useQueries`' weight in first-load JS) re-renders. `isRelevant` must be a stable function.
 */
export function useQueryCacheVersion(isRelevant: (queryKey: QueryKey) => boolean) {
  const queryClient = useQueryClient();
  const changes = useRef(0);
  const subscribe = useCallback(
    (onChange: () => void) =>
      queryClient.getQueryCache().subscribe((event) => {
        // Only a change to what a cache holds, not the bookkeeping of a fetch starting.
        const isDataChange =
          event.type === 'removed' || (event.type === 'updated' && event.action.type === 'success');
        if (!isDataChange || !isRelevant(event.query.queryKey)) return;
        changes.current += 1;
        onChange();
      }),
    [queryClient, isRelevant],
  );
  return useSyncExternalStore(
    subscribe,
    () => changes.current,
    () => 0,
  );
}
