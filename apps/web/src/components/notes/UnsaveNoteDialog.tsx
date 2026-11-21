'use client';

import { useReturnFocus } from '@/components/collections/useReturnFocus';
import { confirmUnsave } from '@/components/saves/useGuestSaves';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { cancelUnsave } from './unsaveRequest';

/** Asks before unsaving a story whose note would go with it. */
export function UnsaveNoteDialog({ storyId }: { storyId: string }) {
  const returnFocus = useReturnFocus();

  function confirm() {
    confirmUnsave(storyId);
    cancelUnsave();
  }
  function handleOpenChange(open: boolean) {
    if (!open) cancelUnsave();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Remove this story and its note?</DialogTitle>
          <DialogDescription>
            The note is deleted with the story and can’t be brought back.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={cancelUnsave}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm}>
            Remove story and note
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
