'use client';

import { answerSignOut, type UnsyncedData } from '@/lib/auth/signOutConfirm';
import { count, joinParts } from '@/lib/guest/guestMerge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useReturnFocus } from '@/lib/useReturnFocus';

/** "2 collections and 1 note", leaving out what is zero. */
function describe({ saves, collections, notes }: UnsyncedData) {
  return joinParts([
    ...(saves > 0 ? [count(saves, 'saved story', 'saved stories')] : []),
    ...(collections > 0 ? [count(collections, 'collection', 'collections')] : []),
    ...(notes > 0 ? [count(notes, 'note', 'notes')] : []),
  ]);
}

/** The question before a sign-out that would remove data the account doesn't hold yet; staying signed in is the default. */
export function SignOutConfirmDialog({ unsynced }: { unsynced: UnsyncedData }) {
  const returnFocus = useReturnFocus();

  function stay() {
    answerSignOut(false);
  }
  function signOutAnyway() {
    answerSignOut(true);
  }
  function handleOpenChange(open: boolean) {
    if (!open) stay();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Some of your data hasn’t synced yet</DialogTitle>
          <DialogDescription>
            {describe(unsynced)} haven’t synced to your account yet. Signing out will remove them
            from this device.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button onClick={stay}>Stay signed in</Button>
          <Button variant="destructive" onClick={signOutAnyway}>
            Sign out anyway
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
