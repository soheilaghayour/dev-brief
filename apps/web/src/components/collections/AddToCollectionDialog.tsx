'use client';

import { useState, type KeyboardEvent } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { useCollections, type CollectionView } from './useCollections';

type AddToCollectionDialogProps = {
  storyId: string;
  onClose: () => void;
};

function matchesQuery(collection: CollectionView, query: string) {
  return collection.name.toLowerCase().includes(query.trim().toLowerCase());
}

/** Type to filter the collections, tick the ones the story belongs to, or press Enter on a new name to create it. */
export function AddToCollectionDialog({ storyId, onClose }: AddToCollectionDialogProps) {
  const collections = useCollections();
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  if (collections.status !== 'ready') return null;

  const matches = collections.collections.filter((collection) => matchesQuery(collection, query));
  const memberOf = new Set(collections.collectionsOf(storyId).map(({ id }) => id));
  const newName = query.trim();
  const willCreate = newName !== '' && matches.length === 0;

  async function toggleMembership(collection: CollectionView) {
    if (collections.status !== 'ready') return;
    if (memberOf.has(collection.id)) {
      await collections.removeItem(collection.id, storyId);
      setAnnouncement(`Removed from ${collection.name}.`);
    } else if ((await collections.addItem(collection.id, storyId)) === 'added') {
      setAnnouncement(`Added to ${collection.name}.`);
    }
  }
  async function createAndAdd() {
    if (collections.status !== 'ready') return;
    const created = await collections.create(newName);
    if (created.outcome !== 'created') return;
    await collections.addItem(created.id, storyId);
    setAnnouncement(`Created ${newName} and added the story.`);
    setQuery('');
  }
  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (willCreate) void createAndAdd();
  }
  function handleOpenChange(open: boolean) {
    if (!open) onClose();
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to collection</DialogTitle>
          <DialogDescription>
            Type to find a collection, or type a new name and press Enter to create it.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={submitOnEnter}
          aria-label="Find or create a collection"
          placeholder="Find or create a collection"
          autoComplete="off"
        />
        <fieldset className="grid gap-1">
          <legend className="sr-only">Collections</legend>
          {matches.map((collection) => (
            <label
              key={collection.id}
              className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <Checkbox
                checked={memberOf.has(collection.id)}
                onChange={() => void toggleMembership(collection)}
              />
              <span className="min-w-0 flex-1 truncate">{collection.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {collection.items.length}
              </span>
            </label>
          ))}
        </fieldset>
        {willCreate && (
          <p className="text-muted-foreground text-sm">
            No collection matches. Press Enter to create “{newName}” and add the story.
          </p>
        )}
        {collections.collections.length === 0 && newName === '' && (
          <p className="text-muted-foreground text-sm">
            You have no collections yet. Type a name to create one.
          </p>
        )}
        <p role="status" className="sr-only">
          {announcement}
        </p>
      </DialogContent>
    </Dialog>
  );
}
