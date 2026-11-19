'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { StoryCard } from '@devbrief/shared';
import { lookupStories } from '@/lib/api/endpoints';
import { notify } from './notify';
import { lookupInChunks, orderSavedStories, unavailableNotice } from './savedStories';
import { useSaves } from './useSaves';

export type SavedStories =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; stories: StoryCard[] };

/** The saved stories for the Saved page; guest mode looks the stored ids up, account mode will list them from the API. */
export function useSavedStories(): SavedStories {
  const saves = useSaves();
  const { isReady, removeUnavailable } = saves;
  // Fixed when the store first loads, so unsaving here neither refetches nor reorders the page.
  const [lookupIds, setLookupIds] = useState<readonly string[] | null>(null);
  if (isReady && lookupIds === null) setLookupIds(saves.ids);

  const query = useQuery({
    queryKey: ['saves', 'guestLookup', lookupIds],
    queryFn: () => lookupInChunks(lookupIds ?? [], lookupStories),
    enabled: lookupIds !== null && lookupIds.length > 0,
  });
  const { data } = query;

  // A refetch reports the same missing ids again; only saves actually removed are announced.
  useEffect(() => {
    if (!data) return;
    const removed = removeUnavailable(data.missingIds);
    if (removed > 0) void notify(unavailableNotice(removed));
  }, [data, removeUnavailable]);

  function retry() {
    void query.refetch();
  }

  if (lookupIds === null) return { status: 'loading' };
  if (lookupIds.length === 0) return { status: 'ready', stories: [] };
  if (query.isError) return { status: 'error', retry };
  if (!data) return { status: 'loading' };
  return { status: 'ready', stories: orderSavedStories(saves.list, data.items) };
}
