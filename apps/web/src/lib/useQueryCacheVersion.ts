import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

/** A value that changes when the data of a matching cache entry does, so a component that reads the cache without an observer re-renders; `isRelevant` must be stable. */
export function useQueryCacheVersion(isRelevant: (queryKey: QueryKey) => boolean) {
  const queryClient = useQueryClient();
  const subscribe = useCallback(
    (onChange: () => void) => queryClient.getQueryCache().subscribe(onChange),
    [queryClient],
  );
  // Derived from the cache, so a change between the render and the subscription is seen too.
  const getVersion = () =>
    queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => isRelevant(query.queryKey))
      .map((query) => `${query.queryHash}:${query.state.dataUpdateCount}`)
      .join('|');
  return useSyncExternalStore(subscribe, getVersion, () => '');
}
