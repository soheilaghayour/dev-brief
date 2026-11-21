'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { preloadCollectionWriters, useCollections, type CollectionView } from './useCollections';
import { useReturnFocus } from './useReturnFocus';

type AddToCollectionDialogProps = {
  storyId: string;
  onClose: () => void;
};

function matchesQuery(collection: CollectionView, query: string) {
  return collection.name.toLowerCase().includes(query.trim().toLowerCase());
}

function sameName(collection: CollectionView, name: string) {
  return collection.name.toLowerCase() === name.toLowerCase();
}

/** Type to filter the collections, tick the ones the story belongs to, or press Enter on a new name to create it. */
export function AddToCollectionDialog({ storyId, onClose }: AddToCollectionDialogProps) {
  const collections = useCollections();
  const returnFocus = useReturnFocus();
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');
  // What the user just ticked, shown until the write lands, so a controlled checkbox doesn't snap back meanwhile.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  // A second Enter while the first create is pending would make a duplicate collection.
  const isCreating = useRef(false);

  useEffect(preloadCollectionWriters, []);

  if (collections.status !== 'ready') return null;

  const matches = collections.collections.filter((collection) => matchesQuery(collection, query));
  const memberOf = new Set(collections.collectionsOf(storyId).map(({ id }) => id));
  const newName = query.trim();
  // A name that only contains another's (Frontend in Frontend Architecture) is still new; only the same name isn't.
  const willCreate =
    newName !== '' && !collections.collections.some((collection) => sameName(collection, newName));

  function isChecked(collection: CollectionView) {
    return ticked[collection.id] ?? memberOf.has(collection.id);
  }
  function setTick(id: string, value: boolean | undefined) {
    setTicked((previous) => {
      const next = { ...previous };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  }
  async function toggleMembership(collection: CollectionView) {
    if (collections.status !== 'ready') return;
    const wasMember = isChecked(collection);
    setTick(collection.id, !wasMember);
    try {
      if (wasMember) {
        await collections.removeItems(collection.id, [storyId]);
        setAnnouncement(`Removed from ${collection.name}.`);
      } else if ((await collections.addItem(collection.id, storyId)) === 'added') {
        setAnnouncement(`Added to ${collection.name}.`);
      }
    } finally {
      // The store now holds the truth: what landed stays ticked, what was refused or failed rolls back.
      setTick(collection.id, undefined);
    }
  }
  async function createAndAdd() {
    if (collections.status !== 'ready' || isCreating.current) return;
    isCreating.current = true;
    try {
      const created = await collections.create(newName);
      if (created.outcome !== 'created') return;
      const outcome = await collections.addItem(created.id, storyId);
      setAnnouncement(
        outcome === 'added'
          ? `Created ${newName} and added the story.`
          : `Created ${newName}. The story was not added.`,
      );
      setQuery('');
    } finally {
      isCreating.current = false;
    }
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
      <DialogContent onCloseAutoFocus={returnFocus}>
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
                checked={isChecked(collection)}
                onChange={() => void toggleMembership(collection)}
              />
              <span className="min-w-0 flex-1 truncate">{collection.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {collection.items.length}
              </span>
            </label>
          ))}
        </fieldset>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <p role="status" className="text-muted-foreground text-sm empty:hidden">
          {willCreate && `Press Enter to create “${newName}” and add the story.`}
        </p>
        {collections.collections.length === 0 && newName === '' && (
          <p className="text-muted-foreground text-sm">
            You have no collections yet. Type a name to create one.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
