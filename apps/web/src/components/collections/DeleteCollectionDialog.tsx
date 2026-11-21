'use client';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useCollections, type CollectionView } from './useCollections';
import { useReturnFocus } from '@/lib/useReturnFocus';

type DeleteCollectionDialogProps = {
  collection: CollectionView;
  /** Where focus returns when the dialog closes. */
  opener: HTMLElement | null;
  /** Called as the deletion is confirmed, before the collection goes, so the caller can leave its board first. */
  onConfirm: () => void;
  /** Called after the collection is gone. */
  onDeleted: () => void;
  onClose: () => void;
};

/** Asks before deleting a collection, and says the saved stories stay. */
export function DeleteCollectionDialog({
  collection,
  opener,
  onConfirm,
  onDeleted,
  onClose,
}: DeleteCollectionDialogProps) {
  const collections = useCollections();
  const count = collection.itemCount;
  const returnFocus = useReturnFocus(opener);

  async function confirm() {
    if (collections.status !== 'ready') return;
    onConfirm();
    await collections.remove(collection.id);
    onDeleted();
  }
  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>Delete “{collection.name}”?</DialogTitle>
          <DialogDescription>
            {count === 0
              ? 'The collection is empty.'
              : `The ${count} ${count === 1 ? 'story' : 'stories'} in it stay saved.`}{' '}
            Only the collection is deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm}>
            Delete collection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
