import { create } from 'zustand';

/** What the device holds that no merge has carried into the account yet. */
export type UnsyncedData = { saves: number; collections: number; notes: number };

export const useSignOutConfirm = create<{ unsynced: UnsyncedData | null }>(() => ({
  unsynced: null,
}));

let answer: ((signOutAnyway: boolean) => void) | null = null;

/** Asks the reader whether to sign out and lose what hasn't synced; resolves true for "Sign out anyway". */
export function confirmSignOut(unsynced: UnsyncedData) {
  return new Promise<boolean>((resolve) => {
    answer = resolve;
    useSignOutConfirm.setState({ unsynced });
  });
}

export function answerSignOut(signOutAnyway: boolean) {
  useSignOutConfirm.setState({ unsynced: null });
  answer?.(signOutAnyway);
  answer = null;
}
