'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaveIds } from '@devbrief/shared';
import { SAVE_IDS_KEY, saveMutationOptions } from './accountSaves';
import { notify } from '@/lib/toast/notify';
import type { ToggleSaveOptions } from './unsaveRequest';

// The endpoints module (and Zod with it) loads on the first request, not with the page.
const lazyRequests = {
  putSave: async (storyId: string) => (await import('@/lib/api/endpoints')).putSave(storyId),
  deleteSave: async (storyId: string) => (await import('@/lib/api/endpoints')).deleteSave(storyId),
  notify,
};

/** Saves kept in the account: ids from the API, changes applied to the cache first and rolled back on error. */
export function useAccountSaves(enabled: boolean) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: SAVE_IDS_KEY,
    queryFn: async () => (await import('@/lib/api/endpoints')).getSaveIds(),
    enabled,
  });
  const mutation = useMutation(saveMutationOptions(queryClient, lazyRequests));
  const ids = useMemo(() => data?.ids ?? [], [data]);
  const savedIds = useMemo(() => new Set(ids), [ids]);

  function isSaved(storyId: string) {
    return savedIds.has(storyId);
  }

  // Read from the cache, not the render's data: two quick toggles must see each other's patch.
  function currentIds() {
    return queryClient.getQueryData<SaveIds>(SAVE_IDS_KEY)?.ids ?? ids;
  }
  function toggle(storyId: string, options?: ToggleSaveOptions) {
    const isSaved = currentIds().includes(storyId);
    if (isSaved) options?.onUnsave?.();
    mutation.mutate({ storyId, save: !isSaved });
  }
  function remove(storyId: string) {
    if (currentIds().includes(storyId)) mutation.mutate({ storyId, save: false });
  }

  return { ids, isSaved, toggle, remove };
}
