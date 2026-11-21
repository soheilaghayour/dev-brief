'use client';

import { useId, useRef, useState, type SubmitEvent } from 'react';
import { CollectionNameSchema } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { useCollections, type CollectionView } from './useCollections';
import { useReturnFocus } from '@/lib/useReturnFocus';

const NAME_ERROR = `Enter a name of ${CollectionNameSchema.minLength} to ${CollectionNameSchema.maxLength} characters.`;

type CollectionNameDialogProps = {
  /** The collection being renamed; absent when creating one. */
  collection?: CollectionView;
  /** Where focus returns when the dialog closes. */
  opener: HTMLElement | null;
  onClose: () => void;
};

/** Creates a collection, or renames the given one; the slug and URL stay on a rename. */
export function CollectionNameDialog({ collection, opener, onClose }: CollectionNameDialogProps) {
  const collections = useCollections();
  const [name, setName] = useState(collection?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const returnFocus = useReturnFocus(opener);
  // A second Enter or click while the first write is pending would create the collection twice.
  const isSubmitting = useRef(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (collections.status !== 'ready' || isSubmitting.current) return;
    isSubmitting.current = true;
    try {
      const outcome = collection
        ? await collections.rename(collection.id, name)
        : (await collections.create(name)).outcome;
      // A refusal at the limit is told by its own toast; only a bad name is an error here.
      if (outcome === 'invalid') setError(NAME_ERROR);
      else onClose();
    } finally {
      isSubmitting.current = false;
    }
  }
  function changeName(value: string) {
    setName(value);
    setError(null);
  }
  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent aria-describedby={undefined} onCloseAutoFocus={returnFocus}>
        <DialogHeader>
          <DialogTitle>{collection ? 'Rename collection' : 'New collection'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <label htmlFor={inputId} className="grid gap-1.5 text-sm font-medium">
            Name
            <Input
              id={inputId}
              value={name}
              onChange={(event) => changeName(event.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error ? errorId : undefined}
              autoComplete="off"
            />
          </label>
          {error && (
            <p id={errorId} role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{collection ? 'Rename' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
