'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  AddToCollectionShortcut,
  useAddToCollection,
} from '@/components/collections/AddToCollection';
import { splitSearchPieces } from '@devbrief/shared';
import type { StoryCard as StoryCardData } from '@devbrief/shared';
import { PreferenceMenu } from '@/components/preferences/PreferenceMenu';
import { usePreferenceState } from '@/components/preferences/usePreferenceState';
import { useSaves } from '@/components/saves/useSaves';
import { isFeatureEnabled } from '@/config/features';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';
import { FeedEmpty } from './FeedEmpty';
import { FeedError } from './FeedError';
import { FeedSkeleton } from './FeedSkeleton';
import { hasActiveFilters, toFeedParams } from './feedParams';
import {
  discussionUrl,
  flattenPages,
  focusableId,
  isEnterOnInteractiveElement,
  moveActiveId,
} from './feedNavigation';
import { feedQueryOptions, personalisedPlaceholder } from './feedQueries';
import { hideMuted } from './hideMuted';
import { HighlightedText } from './HighlightedText';
import { highlightCard } from './searchHighlight';
import { InfiniteSentinel } from './InfiniteSentinel';
import { focusStory, openInNewTab, scrollToStory } from '@/components/storyListDom';
import { ClusterSourceLine } from './ClusterSourceLine';
import { RelatedToggle } from './RelatedToggle';
import { StoryCard } from './StoryCard';
import { SummarizeShortcut } from './SummarizeShortcut';
import { useFeedFilters } from './useFeedFilters';
import { useFocusAfterRemoval } from './useFocusAfterRemoval';

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
const SAVE_STORY = {
  id: 'feed-save',
  keys: 's',
  description: 'Save or unsave the story',
  scope: 'Feed',
} satisfies Shortcut;
const TOGGLE_SORT = {
  id: 'feed-sort',
  keys: 't',
  description: 'Toggle Top / Latest',
  scope: 'Feed',
} satisfies Shortcut;

/** What a search result card renders instead of the plain title, plus the excerpt line when a piece is missing from the title. */
function highlightProps(story: StoryCardData, pieces: string[]) {
  if (pieces.length === 0) return {};
  const { titleRanges, snippet } = highlightCard(story.title, story.excerpt, pieces);
  return {
    titleContent: <HighlightedText text={story.title} ranges={titleRanges} />,
    excerptLine: snippet && <HighlightedText text={snippet.text} ranges={snippet.ranges} />,
  };
}

export function FeedList() {
  const { filters, focus, toggleSort, clearAll } = useFeedFilters();
  const saves = useSaves();
  const addToCollection = useAddToCollection();
  const preferences = usePreferenceState();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    ...feedQueryOptions(filters, preferences.feedParams),
    placeholderData: personalisedPlaceholder(queryClient, filters),
  });
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } = query;
  const { prefs } = preferences;
  const urlQuery = toFeedParams(filters).q ?? '';
  // Placeholder data is the previous search's list, so it stays marked for that `q` until the new data arrives.
  const [markedQuery, setMarkedQuery] = useState(urlQuery);
  if (!query.isPlaceholderData && markedQuery !== urlQuery) setMarkedQuery(urlQuery);
  const searchPieces = useMemo(() => splitSearchPieces(markedQuery), [markedQuery]);
  // The server-rendered page and a list kept while preferences change still hold muted stories.
  const stories = useMemo(() => hideMuted(flattenPages(data?.pages ?? []), prefs), [data, prefs]);
  // Derived from hydrated data, so the server HTML and the first client render agree.
  const [activeId, setActiveId] = useState(() => focusableId(focus, data?.pages[0]));
  const [initialFocusId] = useState(activeId);

  useEffect(() => {
    if (initialFocusId) scrollToStory(initialFocusId, 'center');
  }, [initialFocusId]);

  const activeStory = stories.find(({ id }) => id === activeId);

  function activate(storyId: string) {
    setActiveId(storyId);
    focusStory(storyId);
    scrollToStory(storyId, 'nearest');
  }
  function moveActive(step: 1 | -1) {
    const nextId = moveActiveId(stories, activeId, step);
    if (nextId) activate(nextId);
  }
  const trackFocus = useFocusAfterRemoval(stories, activate);
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
  function toggleActiveSave() {
    if (activeStory) saves.toggle(activeStory.id, { title: activeStory.title });
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
  useShortcut(SAVE_STORY, toggleActiveSave);
  useShortcut(TOGGLE_SORT, toggleSort);

  if (query.isPending) return <FeedSkeleton />;
  if (!data) return <FeedError message="Couldn't load the feed." onRetry={retry} />;
  if (stories.length === 0) {
    return <FeedEmpty onClearFilters={hasActiveFilters(filters) ? clearAll : undefined} />;
  }

  return (
    <div
      role="feed"
      aria-busy={isFetchingNextPage}
      aria-label="Stories"
      onFocusCapture={trackFocus}
    >
      {isFeatureEnabled('summaries') && (activeStory?.canSummarize || activeStory?.hasSummary) && (
        <SummarizeShortcut storyId={activeStory.id} />
      )}
      <AddToCollectionShortcut storyId={activeId} />
      {stories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          isSaved={saves.isSaved(story.id)}
          onToggleSave={() => saves.toggle(story.id, { title: story.title })}
          isActive={story.id === activeId}
          {...highlightProps(story, searchPieces)}
          preferenceMenu={PreferenceMenu}
          relatedToggle={RelatedToggle}
          sourceLine={ClusterSourceLine}
          onAddToCollection={
            addToCollection.canAdd ? () => addToCollection.open(story.id) : undefined
          }
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
        disabled={
          !hasNextPage || isFetchingNextPage || isFetchNextPageError || query.isPlaceholderData
        }
        loadedCount={stories.length}
      />
    </div>
  );
}
