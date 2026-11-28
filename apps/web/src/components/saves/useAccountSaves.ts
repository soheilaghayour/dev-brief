'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SaveIds } from '@devbrief/shared';
import { isFeatureEnabled } from '@/config/features';
import { notify } from '@/lib/toast/notify';
import { findCachedNote, noteKey } from './accountNoteCache';
import { SAVE_IDS_KEY, saveMutationOptions } from './accountSaves';
import { flushPendingNote } from './pendingNote';
import { requestUnsave, type ToggleSaveOptions } from './unsaveRequest';

// The endpoints module (and Zod with it) loads on the first request, not with the page.
const lazyRequests = {
  putSave: async (storyId: string) => (await import('@/lib/api/endpoints')).putSave(storyId),
  deleteSave: async (storyId: string) => (await import('@/lib/api/endpoints')).deleteSave(storyId),
  notify,
};

// Stories whose note is being looked up for an unsave.
const lookingUp = new Set<string>();

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
  // A story's note is only in the caches where it was shown, so the unsave may have to ask the server for it.
  async function lookUpNote(storyId: string): Promise<'note' | 'none' | 'unknown'> {
    await flushPendingNote();
    const cached = findCachedNote(queryClient, storyId);
    if (cached) return cached.note ? 'note' : 'none';
    try {
      const save = await queryClient.fetchQuery({
        queryKey: noteKey(storyId),
        queryFn: async () => (await import('@/lib/api/endpoints')).getSave(storyId),
      });
      return save.note ? 'note' : 'none';
    } catch {
      return 'unknown';
    }
  }
  // Asks first when the story has a note, or may have one, wherever the unsave comes from (AC-3.4.2).
  async function unsave(storyId: string, options?: ToggleSaveOptions) {
    if (options && isFeatureEnabled('collections')) {
      // A second press while the lookup is out would ask twice, or unsave behind the dialog.
      if (lookingUp.has(storyId)) return;
      lookingUp.add(storyId);
      const found = await lookUpNote(storyId).finally(() => lookingUp.delete(storyId));
      if (found !== 'none') {
        requestUnsave({ storyId, ...options, isNoteUnknown: found === 'unknown' });
        return;
      }
    }
    mutation.mutate({ storyId, save: false });
  }
  function toggle(storyId: string, options?: ToggleSaveOptions) {
    if (currentIds().includes(storyId)) void unsave(storyId, options);
    else mutation.mutate({ storyId, save: true });
  }
  function remove(storyId: string) {
    if (currentIds().includes(storyId)) mutation.mutate({ storyId, save: false });
  }

  return { ids, isSaved, toggle, remove };
}
