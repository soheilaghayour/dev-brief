'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { clearGuestData } from '@/lib/guest/clear';
import { authClient } from './authClient';
import { ME_QUERY_KEY } from './useMe';

/** Signs out, empties the local guest store and puts the app back in guest mode; account data is not copied back. */
export function useSignOut() {
  const queryClient = useQueryClient();

  async function signOutAndForget() {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error('Could not sign out. Try again.');
      return;
    }
    clearGuestData();
    queryClient.setQueryData(ME_QUERY_KEY, null);
  }

  return function signOut() {
    void signOutAndForget();
  };
}
