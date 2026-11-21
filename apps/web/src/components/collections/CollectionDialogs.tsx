'use client';

import { CollectionNameDialog } from './CollectionNameDialog';
import { DeleteCollectionDialog } from './DeleteCollectionDialog';
import { useCollections, type CollectionView } from './useCollections';

export type CollectionDialog =
  { kind: 'create' } | { kind: 'rename'; id: string } | { kind: 'delete'; id: string };

type CollectionDialogsProps = {
  dialog: CollectionDialog;
  onDeleted: (collection: CollectionView) => void;
  onClose: () => void;
};

/** Whichever of the create, rename and delete dialogs is open; one chunk, fetched on the first open. */
export function CollectionDialogs({ dialog, onDeleted, onClose }: CollectionDialogsProps) {
  const collections = useCollections();
  if (dialog.kind === 'create') return <CollectionNameDialog onClose={onClose} />;
  const collection =
    collections.status === 'ready'
      ? collections.collections.find(({ id }) => id === dialog.id)
      : undefined;
  if (!collection) return null;
  if (dialog.kind === 'rename')
    return <CollectionNameDialog collection={collection} onClose={onClose} />;
  return (
    <DeleteCollectionDialog
      collection={collection}
      onDeleted={() => onDeleted(collection)}
      onClose={onClose}
    />
  );
}
