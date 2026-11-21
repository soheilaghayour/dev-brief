'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/lib/auth/useMe';
import { findCachedNote, noteKey } from './accountNoteCache';

/**
 * Whether a story's note is known, so an editor never opens on an empty text over a note it hasn't loaded.
 * A guest's notes are on the device; an account's come from the saved list or a board, or from the story's own save.
 */
export function useNoteLoaded(storyId: string) {
  const queryClient = useQueryClient();
  const { data: user } = useMe();
  const isAccount = Boolean(user);
  const isCached = isAccount && findCachedNote(queryClient, storyId) !== undefined;
  const query = useQuery({
    queryKey: noteKey(storyId),
    queryFn: async () => (await import('@/lib/api/endpoints')).getSave(storyId),
    enabled: isAccount && !isCached,
  });
  return !isAccount || isCached || query.isSuccess;
}
