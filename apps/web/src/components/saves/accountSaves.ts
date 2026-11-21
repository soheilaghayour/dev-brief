import type { InfiniteData, MutationOptions, QueryClient } from '@tanstack/react-query';
import type { Save, SaveIds, SavedStoryPage } from '@devbrief/shared';

export const SAVE_IDS_KEY = ['saves', 'ids'] as const;
export const SAVE_LIST_KEY = ['saves', 'list'] as const;
const SAVE_MUTATION_KEY = ['saves', 'toggle'] as const;

export const SAVE_FAILED_NOTICE = "Couldn't save — retry";

type SavedList = InfiniteData<SavedStoryPage, string | undefined>;
type ToggleVariables = { storyId: string; save: boolean };
type Snapshot = { ids: SaveIds | undefined; list: SavedList | undefined };

/** The ids with the story added at the front (newest first) or removed. */
export function patchSaveIds(data: SaveIds | undefined, { storyId, save }: ToggleVariables) {
  if (!data) return data;
  const others = data.ids.filter((id) => id !== storyId);
  return { ids: save ? [storyId, ...others] : others };
}

/** The saved list without the story; a new save is not added, since the list needs its card from the server. */
export function patchSavedList(data: SavedList | undefined, { storyId, save }: ToggleVariables) {
  if (!data || save) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.story.id !== storyId),
    })),
  };
}

type SaveRequests = {
  putSave: (storyId: string) => Promise<Save>;
  deleteSave: (storyId: string) => Promise<void>;
  notify: (message: string) => Promise<void> | void;
};

/** The optimistic save/unsave mutation (PRD §7.5): patch both caches at once, roll back with a toast on error, refetch when the last one settles. */
export function saveMutationOptions(
  queryClient: QueryClient,
  { putSave, deleteSave, notify }: SaveRequests,
): MutationOptions<unknown, Error, ToggleVariables, Snapshot> {
  return {
    mutationKey: SAVE_MUTATION_KEY,
    // One scope runs the mutations in order, so a quick save then unsave can't reach the server reversed.
    scope: { id: 'saves' },
    mutationFn: ({ storyId, save }) => (save ? putSave(storyId) : deleteSave(storyId)),
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: SAVE_IDS_KEY, exact: true }),
        queryClient.cancelQueries({ queryKey: SAVE_LIST_KEY, exact: true }),
      ]);
      const snapshot: Snapshot = {
        ids: queryClient.getQueryData<SaveIds>(SAVE_IDS_KEY),
        list: queryClient.getQueryData<SavedList>(SAVE_LIST_KEY),
      };
      queryClient.setQueryData<SaveIds>(SAVE_IDS_KEY, (ids) => patchSaveIds(ids, variables));
      queryClient.setQueryData<SavedList>(SAVE_LIST_KEY, (list) => patchSavedList(list, variables));
      return snapshot;
    },
    // A rollback restores the snapshot from before any toggle still pending; the refetch in onSettled puts that toggle back.
    onError: (_error, _variables, snapshot) => {
      if (snapshot) {
        queryClient.setQueryData(SAVE_IDS_KEY, snapshot.ids);
        queryClient.setQueryData(SAVE_LIST_KEY, snapshot.list);
      }
      void notify(SAVE_FAILED_NOTICE);
    },
    // Only the last of several quick toggles refetches, so an early answer can't overwrite a later patch.
    onSettled: (_data, _error, { storyId, save }) => {
      // The server removed the story, and its note, from every board it was on.
      if (!save) {
        queryClient.removeQueries({ queryKey: ['saves', 'note', storyId], exact: true });
        void queryClient.invalidateQueries({ queryKey: ['collections'] });
      }
      if (queryClient.isMutating({ mutationKey: SAVE_MUTATION_KEY }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: SAVE_IDS_KEY, exact: true });
      void queryClient.invalidateQueries({ queryKey: SAVE_LIST_KEY, exact: true });
    },
  };
}
