'use client';

import { useCallback, useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { StoryCard } from '@devbrief/shared';
import { SAVE_LIST_KEY } from './accountSaves';
import { notify } from './notify';
import { lookupInChunks, orderSavedStories, unavailableNotice } from './savedStories';
import { useGuestSaves } from './useGuestSaves';
import { useSaves } from './useSaves';

type ReadyStories = {
  status: 'ready';
  stories: StoryCard[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  loadMore: () => void;
};

export type SavedStories =
  { status: 'loading' } | { status: 'error'; retry: () => void } | ReadyStories;

const noMore = {
  hasMore: false,
  isLoadingMore: false,
  loadMoreFailed: false,
  loadMore: () => {},
} satisfies Partial<ReadyStories>;

/** The saved stories for the Saved page: the account's saves from the API, or the stored ids looked up for a guest. */
export function useSavedStories(): SavedStories {
  const { mode, isReady } = useSaves();
  const guest = useGuestSaves();
  const guestLookup = useGuestLookup(mode === 'guest' && isReady, guest);
  const account = useInfiniteQuery({
    queryKey: SAVE_LIST_KEY,
    queryFn: async ({ pageParam }) => {
      const { getSaves } = await import('@/lib/api/endpoints');
      return getSaves({ cursor: pageParam });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: mode === 'account',
  });
  const { fetchNextPage } = account;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  if (mode === 'guest') return guestLookup;
  function retry() {
    void account.refetch();
  }
  if (account.isError && !account.data) return { status: 'error', retry };
  if (!account.data) return { status: 'loading' };
  return {
    status: 'ready',
    stories: account.data.pages.flatMap((page) => page.items.map((item) => item.story)),
    hasMore: account.hasNextPage,
    isLoadingMore: account.isFetchingNextPage,
    loadMoreFailed: account.isFetchNextPageError,
    loadMore,
  };
}

function useGuestLookup(enabled: boolean, guest: ReturnType<typeof useGuestSaves>): SavedStories {
  const { removeUnavailable } = guest;
  // Fixed when the store first loads, so unsaving here neither refetches nor reorders the page.
  const [lookupIds, setLookupIds] = useState<readonly string[] | null>(null);
  if (enabled && lookupIds === null) setLookupIds(guest.ids);

  const query = useQuery({
    queryKey: ['saves', 'guestLookup', lookupIds],
    queryFn: async () => {
      const { lookupStories } = await import('@/lib/api/endpoints');
      return lookupInChunks(lookupIds ?? [], lookupStories);
    },
    enabled: lookupIds !== null && lookupIds.length > 0,
  });
  const { data } = query;

  // A refetch reports the same missing ids again; only saves actually removed are announced.
  useEffect(() => {
    if (!data) return;
    void removeUnavailable(data.missingIds).then((removed) => {
      if (removed > 0) void notify(unavailableNotice(removed));
    });
  }, [data, removeUnavailable]);

  function retry() {
    void query.refetch();
  }

  if (lookupIds === null) return { status: 'loading' };
  if (lookupIds.length === 0) return { status: 'ready', stories: [], ...noMore };
  if (query.isError) return { status: 'error', retry };
  if (!data) return { status: 'loading' };
  return { status: 'ready', stories: orderSavedStories(guest.list, data.items), ...noMore };
}
