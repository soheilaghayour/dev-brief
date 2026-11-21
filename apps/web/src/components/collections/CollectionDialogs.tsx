'use client';

import { CollectionNameDialog } from './CollectionNameDialog';
import { DeleteCollectionDialog } from './DeleteCollectionDialog';
import { useCollections, type CollectionView } from './useCollections';

/** What opened the dialog, and the element focus returns to when it closes. */
export type CollectionDialog = { opener: HTMLElement | null } & (
  { kind: 'create' } | { kind: 'rename'; id: string } | { kind: 'delete'; id: string }
);

type CollectionDialogsProps = {
  dialog: CollectionDialog;
  onDeleting: (collection: CollectionView) => void;
  onDeleted: (collection: CollectionView) => void;
  onClose: () => void;
};

/** Whichever of the create, rename and delete dialogs is open; one chunk, fetched on the first open. */
export function CollectionDialogs({
  dialog,
  onDeleting,
  onDeleted,
  onClose,
}: CollectionDialogsProps) {
  const collections = useCollections();
  if (dialog.kind === 'create')
    return <CollectionNameDialog opener={dialog.opener} onClose={onClose} />;
  const collection =
    collections.status === 'ready'
      ? collections.collections.find(({ id }) => id === dialog.id)
      : undefined;
  if (!collection) return null;
  if (dialog.kind === 'rename')
    return (
      <CollectionNameDialog collection={collection} opener={dialog.opener} onClose={onClose} />
    );
  return (
    <DeleteCollectionDialog
      collection={collection}
      opener={dialog.opener}
      onConfirm={() => onDeleting(collection)}
      onDeleted={() => onDeleted(collection)}
      onClose={onClose}
    />
  );
}
