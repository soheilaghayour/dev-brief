'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaveIds } from '@devbrief/shared';
import { deleteSave, getSaveIds, putSave } from '@/lib/api/endpoints';
import { SAVE_IDS_KEY, saveMutationOptions } from './accountSaves';
import { notify } from './notify';

/** Saves kept in the account: ids from the API, changes applied to the cache first and rolled back on error. */
export function useAccountSaves(enabled: boolean) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: SAVE_IDS_KEY, queryFn: getSaveIds, enabled });
  const mutation = useMutation(saveMutationOptions(queryClient, { putSave, deleteSave, notify }));
  const ids = useMemo(() => data?.ids ?? [], [data]);
  const savedIds = useMemo(() => new Set(ids), [ids]);

  function isSaved(storyId: string) {
    return savedIds.has(storyId);
  }

  // Read from the cache, not the render's data: two quick toggles must see each other's patch.
  function toggle(storyId: string) {
    const current = queryClient.getQueryData<SaveIds>(SAVE_IDS_KEY)?.ids ?? ids;
    mutation.mutate({ storyId, save: !current.includes(storyId) });
  }

  return { ids, isSaved, toggle };
}
