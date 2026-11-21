'use client';

import { useReturnFocus } from '@/lib/useReturnFocus';
import { cancelUnsave, type UnsaveRequest } from '@/components/saves/unsaveRequest';
import { useSaves } from '@/components/saves/useSaves';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';

/** Asks before unsaving a story whose note would go with it. */
export function UnsaveNoteDialog({ request }: { request: UnsaveRequest }) {
  const returnFocus = useReturnFocus();
  const saves = useSaves();

  function confirm() {
    request.onUnsave?.();
    void saves.remove(request.storyId);
    cancelUnsave();
  }
  function handleOpenChange(open: boolean) {
    if (!open) cancelUnsave();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Remove “{request.title}” and its note?</DialogTitle>
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
