'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { FolderOpenIcon, SearchXIcon, XIcon } from 'lucide-react';
import { FeedError } from '@/components/feed/FeedError';
import { FeedSkeleton } from '@/components/feed/FeedSkeleton';
import { StoryCard } from '@/components/feed/StoryCard';
import { LazyDigestExportMenu, LazyNoteShortcut, LazyNoteSlot } from '@/components/notes/LazyNotes';
import { PreferenceMenu } from '@/components/preferences/PreferenceMenu';
import { lookupInChunks } from '@/components/saves/savedStories';
import { useSaves } from '@/components/saves/useSaves';
import { Button } from '@/components/ui/Button';
import { BOARD_SHORTCUTS, useStoryListNavigation } from '@/components/useStoryListNavigation';
import { AddToCollectionShortcut, useAddToCollection } from './AddToCollection';
import { BoardSkeleton } from './BoardSkeleton';
import { CollectionsSidebar } from './CollectionsSidebar';
import { useCollections, type CollectionView } from './useCollections';

function BoardNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <SearchXIcon className="text-muted-foreground size-8" aria-hidden="true" />
      <div>
        <h1 className="font-medium">Collection not found</h1>
        <p className="text-muted-foreground mt-1">
          It may have been deleted or live on another device.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/saved">Back to Saved</Link>
      </Button>
    </div>
  );
}

function BoardEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <FolderOpenIcon className="text-muted-foreground size-8" aria-hidden="true" />
      <div>
        <p className="font-medium">Nothing in this collection yet</p>
        <p className="text-muted-foreground mt-1">
          Press A on a story, or use its folder button, to add it here.
        </p>
      </div>
    </div>
  );
}

// Ids only join the lookup, never leave it, so removing a card neither refetches nor reorders the rest, while a story another tab added still appears.
function useBoardStories(collection: CollectionView) {
  const collections = useCollections();
  const [lookupIds, setLookupIds] = useState(() => collection.items.map(({ storyId }) => storyId));
  const looked = new Set(lookupIds);
  const newIds = collection.items
    .map(({ storyId }) => storyId)
    .filter((storyId) => !looked.has(storyId));
  if (newIds.length > 0) setLookupIds([...lookupIds, ...newIds]);

  const query = useQuery({
    queryKey: ['collections', 'board', collection.id, lookupIds],
    queryFn: async () => {
      const { lookupStories } = await import('@/lib/api/endpoints');
      return lookupInChunks(lookupIds, lookupStories);
    },
    enabled: lookupIds.length > 0,
    placeholderData: keepPreviousData,
  });
  const byId = new Map((query.data?.items ?? []).map((story) => [story.id, story]));
  // Collection order, and only what the collection still holds.
  const stories = collection.items.flatMap(({ storyId }) => byId.get(storyId) ?? []);

  // A story that no longer exists can never show, so the board drops it from its own collection.
  const missingIds = query.data?.missingIds;
  const removeItems = collections.status === 'ready' ? collections.removeItems : undefined;
  useEffect(() => {
    const gone = (missingIds ?? []).filter((storyId) =>
      collection.items.some((item) => item.storyId === storyId),
    );
    if (gone.length > 0) void removeItems?.(collection.id, gone);
  }, [missingIds, collection.id, collection.items, removeItems]);

  return { stories, isLoading: lookupIds.length > 0 && query.isPending, query };
}

function BoardContent({ collection }: { collection: CollectionView }) {
  const collections = useCollections();
  const saves = useSaves();
  const addToCollection = useAddToCollection();
  const { stories, isLoading, query } = useBoardStories(collection);
  const { activeId, leaveStory, toggleStory } = useStoryListNavigation({
    stories,
    shortcuts: BOARD_SHORTCUTS,
    onToggleSave: saves.toggle,
  });

  function removeFromCollection(storyId: string) {
    leaveStory(storyId);
    if (collections.status === 'ready') void collections.removeItems(collection.id, [storyId]);
  }
  function retry() {
    void query.refetch();
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{collection.name}</h1>
        {stories.length > 0 && (
          <LazyDigestExportMenu
            stories={stories}
            fixedCollection={{
              name: collection.name,
              slug: collection.slug,
              storyIds: collection.items.map(({ storyId }) => storyId),
            }}
          />
        )}
      </div>
      {collection.description && (
        <p className="text-muted-foreground mt-1">{collection.description}</p>
      )}
      <div className="mt-4">
        {isLoading ? (
          <FeedSkeleton />
        ) : query.isError ? (
          <FeedError message="Couldn't load this collection." onRetry={retry} />
        ) : stories.length === 0 ? (
          <BoardEmpty />
        ) : (
          <div role="feed" aria-label={`Stories in ${collection.name}`}>
            <AddToCollectionShortcut storyId={activeId} />
            <LazyNoteShortcut storyId={activeId} />
            {stories.map((story) => (
              <StoryCard
                key={story.id}
                story={story}
                isSaved={saves.isSaved(story.id)}
                onToggleSave={() => toggleStory(story.id)}
                isActive={story.id === activeId}
                preferenceMenu={PreferenceMenu}
                note={<LazyNoteSlot storyId={story.id} />}
                onAddToCollection={
                  addToCollection.canAdd ? () => addToCollection.open(story.id) : undefined
                }
                actions={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove from ${collection.name}`}
                    title="Remove from collection"
                    onClick={() => removeFromCollection(story.id)}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A guest's collection at `/collections/<slug>`, with its sidebar; a slug that isn't on this device shows a not-found state. */
export function CollectionBoard({ slug }: { slug: string }) {
  const collections = useCollections();
  if (collections.status === 'loading') return <BoardSkeleton />;
  const collection =
    collections.status === 'ready'
      ? collections.collections.find((candidate) => candidate.slug === slug)
      : undefined;
  if (!collection) return <BoardNotFound />;

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <CollectionsSidebar activeSlug={slug} />
      <BoardContent collection={collection} />
    </div>
  );
}
