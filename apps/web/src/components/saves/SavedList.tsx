'use client';

import { BookmarkIcon } from 'lucide-react';
import { useAddToCollection } from '@/components/collections/AddToCollection';
import { FeedError } from '@/components/feed/FeedError';
import { FeedSkeleton } from '@/components/feed/FeedSkeleton';
import { InfiniteSentinel } from '@/components/feed/InfiniteSentinel';
import { StoryCard } from '@/components/feed/StoryCard';
import { LazyDigestExportMenu, LazyNoteSlot } from '@/components/notes/LazyNotes';
import { useNotesVersion } from './useNotesVersion';
import { useSaves } from './useSaves';
import { useSavedStories } from './useSavedStories';

function SavedEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <BookmarkIcon className="text-muted-foreground size-8" aria-hidden="true" />
      <div>
        <p className="font-medium">Nothing saved yet</p>
        <p className="text-muted-foreground mt-1">
          Use a story's Save button in the feed to keep it here.
        </p>
      </div>
    </div>
  );
}

export function SavedList() {
  const saves = useSaves();
  // The notes under the cards are read from the caches.
  useNotesVersion();
  const saved = useSavedStories();
  const addToCollection = useAddToCollection();
  const stories = saved.status === 'ready' ? saved.stories : [];

  if (saved.status === 'loading') return <FeedSkeleton />;
  if (saved.status === 'error')
    return <FeedError message="Couldn't load your saved stories." onRetry={saved.retry} />;
  if (stories.length === 0) return <SavedEmpty />;

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <LazyDigestExportMenu stories={stories} />
      </div>
      <div role="feed" aria-label="Saved stories">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            isSaved={saves.isSaved(story.id)}
            onToggleSave={() => saves.toggle(story.id, { title: story.title })}
            note={<LazyNoteSlot storyId={story.id} />}
            onAddToCollection={
              addToCollection.canAdd ? () => addToCollection.open(story.id) : undefined
            }
          />
        ))}
        {saved.loadMoreFailed && (
          <FeedError message="Couldn't load more saved stories." onRetry={saved.loadMore} />
        )}
        {saved.isLoadingMore && <FeedSkeleton />}
        <InfiniteSentinel
          onVisible={saved.loadMore}
          disabled={!saved.hasMore || saved.isLoadingMore || saved.loadMoreFailed}
          loadedCount={stories.length}
        />
      </div>
    </div>
  );
}
