'use client';

import { useCallback, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAddToCollection } from '@/components/collections/AddToCollection';
import { splitSearchPieces } from '@devbrief/shared';
import type { StoryCard as StoryCardData } from '@devbrief/shared';
import { PreferenceMenu } from '@/components/preferences/PreferenceMenu';
import { usePreferenceState } from '@/components/preferences/usePreferenceState';
import { useSaves } from '@/components/saves/useSaves';
import { FeedEmpty } from './FeedEmpty';
import { FeedError } from './FeedError';
import { FeedSkeleton } from './FeedSkeleton';
import { hasActiveFilters, toFeedParams } from './feedParams';
import { flattenPages } from './feedPages';
import { feedQueryOptions, personalisedPlaceholder } from './feedQueries';
import { hideMuted } from './hideMuted';
import { HighlightedText } from './HighlightedText';
import { highlightCard } from './searchHighlight';
import { InfiniteSentinel } from './InfiniteSentinel';
import { focusStory, scrollToStory } from '@/components/storyListDom';
import { ClusterSourceLine } from './ClusterSourceLine';
import { RelatedToggle } from './RelatedToggle';
import { StoryCard } from './StoryCard';
import { useFeedFilters } from './useFeedFilters';
import { useFocusAfterRemoval } from './useFocusAfterRemoval';

/** What a search result card renders instead of the plain title, plus the excerpt line when a piece is missing from the title. */
function highlightProps(story: StoryCardData, pieces: string[]) {
  if (pieces.length === 0) return {};
  const { titleRanges, snippet } = highlightCard(story.title, story.excerpt, pieces);
  return {
    titleContent: <HighlightedText text={story.title} ranges={titleRanges} />,
    excerptLine: snippet && <HighlightedText text={snippet.text} ranges={snippet.ranges} />,
  };
}

function focusAndReveal(storyId: string) {
  focusStory(storyId);
  scrollToStory(storyId);
}

export function FeedList() {
  const { filters, clearAll } = useFeedFilters();
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
  const trackFocus = useFocusAfterRemoval(stories, focusAndReveal);

  // Stable, so the sentinel's observer isn't rebuilt on every render.
  const loadNextPage = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  function retry() {
    void query.refetch();
  }

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
      {stories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          isSaved={saves.isSaved(story.id)}
          onToggleSave={() => saves.toggle(story.id, { title: story.title })}
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
