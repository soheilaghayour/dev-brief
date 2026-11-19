'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';
import { FeedEmpty } from './FeedEmpty';
import { FeedError } from './FeedError';
import { FeedSkeleton } from './FeedSkeleton';
import { hasActiveFilters } from './feedParams';
import {
  discussionUrl,
  flattenPages,
  focusableId,
  isEnterOnInteractiveElement,
  isHttpUrl,
  moveActiveId,
} from './feedNavigation';
import { feedQueryOptions } from './feedQueries';
import { InfiniteSentinel } from './InfiniteSentinel';
import { StoryCard } from './StoryCard';
import { useFeedFilters } from './useFeedFilters';

const NEXT_STORY = {
  id: 'feed-next',
  keys: 'j',
  description: 'Next story',
  scope: 'Feed',
} satisfies Shortcut;
const PREVIOUS_STORY = {
  id: 'feed-previous',
  keys: 'k',
  description: 'Previous story',
  scope: 'Feed',
} satisfies Shortcut;
const OPEN_ORIGINAL = {
  id: 'feed-open',
  keys: 'o',
  description: 'Open the original in a new tab',
  scope: 'Feed',
} satisfies Shortcut;
const OPEN_ORIGINAL_ENTER = {
  ...OPEN_ORIGINAL,
  id: 'feed-open-enter',
  keys: 'enter',
} satisfies Shortcut;
const OPEN_DISCUSSION = {
  id: 'feed-discussion',
  keys: 'c',
  description: 'Open the discussion in a new tab',
  scope: 'Feed',
} satisfies Shortcut;
const TOGGLE_SORT = {
  id: 'feed-sort',
  keys: 't',
  description: 'Toggle Top / Latest',
  scope: 'Feed',
} satisfies Shortcut;

// Saving arrives with the saves module; until then every card is unsaved and the button does nothing.
function ignoreSave() {}

function openInNewTab(url: string) {
  if (isHttpUrl(url)) window.open(url, '_blank', 'noopener,noreferrer');
}

function findStoryElement(id: string) {
  return document.querySelector(`[data-story-id="${CSS.escape(id)}"]`);
}

function scrollToStory(id: string, block: ScrollLogicalPosition) {
  findStoryElement(id)?.scrollIntoView({ block, behavior: 'instant' });
}

// Moving DOM focus to the title link tells screen readers which card is active and gives a native focus ring.
function focusStory(id: string) {
  findStoryElement(id)?.querySelector('a')?.focus({ preventScroll: true });
}

export function FeedList() {
  const { filters, focus, toggleSort, clearAll } = useFeedFilters();
  const query = useInfiniteQuery(feedQueryOptions(filters));
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = query;
  const stories = useMemo(() => flattenPages(data?.pages ?? []), [data]);
  // Derived from hydrated data, so the server HTML and the first client render agree.
  const [activeId, setActiveId] = useState(() => focusableId(focus, data?.pages[0]));
  const [initialFocusId] = useState(activeId);

  useEffect(() => {
    if (initialFocusId) scrollToStory(initialFocusId, 'center');
  }, [initialFocusId]);

  const activeStory = stories.find(({ id }) => id === activeId);

  function moveActive(step: 1 | -1) {
    const nextId = moveActiveId(stories, activeId, step);
    if (!nextId) return;
    setActiveId(nextId);
    focusStory(nextId);
    scrollToStory(nextId, 'nearest');
  }
  function goToNext() {
    moveActive(1);
  }
  function goToPrevious() {
    moveActive(-1);
  }
  function openOriginal() {
    if (activeStory) openInNewTab(activeStory.url);
  }
  function openOriginalOnEnter(event: KeyboardEvent) {
    if (!isEnterOnInteractiveElement(event.key, event.target)) openOriginal();
  }
  function openDiscussion() {
    const url = activeStory && discussionUrl(activeStory);
    if (url) openInNewTab(url);
  }
  // Stable, so the sentinel's observer isn't rebuilt on every j/k press.
  const loadNextPage = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  function retry() {
    void query.refetch();
  }

  useShortcut(NEXT_STORY, goToNext);
  useShortcut(PREVIOUS_STORY, goToPrevious);
  useShortcut(OPEN_ORIGINAL, openOriginal);
  useShortcut(OPEN_ORIGINAL_ENTER, openOriginalOnEnter);
  useShortcut(OPEN_DISCUSSION, openDiscussion);
  useShortcut(TOGGLE_SORT, toggleSort);

  if (query.isPending) return <FeedSkeleton />;
  if (!data) return <FeedError message="Couldn't load the feed." onRetry={retry} />;
  if (stories.length === 0) {
    return <FeedEmpty onClearFilters={hasActiveFilters(filters) ? clearAll : undefined} />;
  }

  return (
    <div role="feed" aria-busy={isFetchingNextPage} aria-label="Stories">
      {stories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          isSaved={false}
          onToggleSave={ignoreSave}
          isActive={story.id === activeId}
        />
      ))}
      {isFetchNextPageError && (
        <FeedError message="Couldn't load more stories." onRetry={loadNextPage} />
      )}
      {isFetchingNextPage && <FeedSkeleton />}
      {!hasNextPage && (
        <p className="text-muted-foreground py-6 text-center text-xs">You&apos;re all caught up.</p>
      )}
      <InfiniteSentinel
        onVisible={loadNextPage}
        disabled={!hasNextPage || isFetchingNextPage || isFetchNextPageError}
        loadedCount={stories.length}
      />
    </div>
  );
}
