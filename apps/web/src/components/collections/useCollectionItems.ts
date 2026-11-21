'use client';

import { useQueries } from '@tanstack/react-query';
import { useMe } from '@/lib/auth/useMe';
import { collectionKey, isPendingCollectionId } from './collectionKeys';

async function fetchCollection(id: string) {
  return (await import('@/lib/api/endpoints')).getCollection(id);
}

/** Loads the items of these collections for an account (a guest's are on the device already); `isLoading` holds until every one has arrived. */
export function useCollectionItems(collectionIds: readonly string[]) {
  const { data: user } = useMe();
  const isAccount = Boolean(user);
  return useQueries({
    queries: collectionIds.map((id) => ({
      queryKey: collectionKey(id),
      queryFn: () => fetchCollection(id),
      enabled: isAccount && !isPendingCollectionId(id),
    })),
    combine: (results) => ({
      isLoading: results.some((result) => result.isPending && result.fetchStatus !== 'idle'),
    }),
  });
}
