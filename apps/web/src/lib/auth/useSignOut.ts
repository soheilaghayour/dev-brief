'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { runMerge } from '@/components/saves/runMerge';
import { forgetAllFailedNotes } from '@/components/saves/pendingNote';
import { clearGuestData } from '@/lib/guest/clear';
import { latestGuestData } from '@/lib/guest/guestSaves';
import { authClient } from './authClient';
import { ME_QUERY_KEY } from './meQueryKey';
import { confirmSignOut, type UnsyncedData } from './signOutConfirm';

/** What the device still holds after the merge had its turns, or null when the account has it all. */
async function unsyncedAfterMerge(queryClient: QueryClient): Promise<UnsyncedData | null> {
  // Joins a merge in flight, or runs the one a fresh load hasn't started yet.
  await runMerge(queryClient);
  if ((await latestGuestData()).pendingMerge) await runMerge(queryClient);
  const { pendingMerge, saves, collections, notes } = await latestGuestData();
  if (!pendingMerge) return null;
  const unsynced = {
    saves: saves.length,
    collections: collections.length,
    notes: Object.keys(notes).length,
  };
  return Object.values(unsynced).some((amount) => amount > 0) ? unsynced : null;
}

/** Signs out, empties the local guest store and puts the app back in guest mode; asks first when the account lacks some of the device's data. */
export function useSignOut() {
  const queryClient = useQueryClient();

  async function signOutAndForget() {
    const unsynced = await unsyncedAfterMerge(queryClient);
    if (unsynced && !(await confirmSignOut(unsynced))) return;
    const { error } = await authClient.signOut();
    if (error) {
      toast.error('Could not sign out. Try again.');
      return;
    }
    clearGuestData();
    forgetAllFailedNotes();
    queryClient.setQueryData(ME_QUERY_KEY, null);
    // The next sign-in must not see this account's saves, preferences or collections.
    queryClient.removeQueries({ queryKey: ['saves'] });
    queryClient.removeQueries({ queryKey: ['prefs'] });
    queryClient.removeQueries({ queryKey: ['collections'] });
  }

  return function signOut() {
    void signOutAndForget();
  };
}
