'use client';

import { useState } from 'react';
import { BookmarkIcon } from 'lucide-react';
import { FeedError } from '@/components/feed/FeedError';
import { FeedSkeleton } from '@/components/feed/FeedSkeleton';
import {
  isEnterOnInteractiveElement,
  discussionUrl,
  moveActiveId,
} from '@/components/feed/feedNavigation';
import { StoryCard } from '@/components/feed/StoryCard';
import { focusStory, openInNewTab, scrollToStory } from '@/components/storyListDom';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';
import { useSaves } from './useSaves';
import { useSavedStories } from './useSavedStories';

const NEXT_STORY = {
  id: 'saved-next',
  keys: 'j',
  description: 'Next story',
  scope: 'Saved',
} satisfies Shortcut;
const PREVIOUS_STORY = {
  id: 'saved-previous',
  keys: 'k',
  description: 'Previous story',
  scope: 'Saved',
} satisfies Shortcut;
const OPEN_ORIGINAL = {
  id: 'saved-open',
  keys: 'o',
  description: 'Open the original in a new tab',
  scope: 'Saved',
} satisfies Shortcut;
const OPEN_ORIGINAL_ENTER = {
  ...OPEN_ORIGINAL,
  id: 'saved-open-enter',
  keys: 'enter',
} satisfies Shortcut;
const OPEN_DISCUSSION = {
  id: 'saved-discussion',
  keys: 'c',
  description: 'Open the discussion in a new tab',
  scope: 'Saved',
} satisfies Shortcut;
const SAVE_STORY = {
  id: 'saved-save',
  keys: 's',
  description: 'Save or unsave the story',
  scope: 'Saved',
} satisfies Shortcut;

function SavedEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <BookmarkIcon className="text-muted-foreground size-8" aria-hidden="true" />
      <div>
        <p className="font-medium">Nothing saved yet</p>
        <p className="text-muted-foreground mt-1">
          Press S on a story in the feed, or use its bookmark, to keep it here.
        </p>
      </div>
    </div>
  );
}

export function SavedList() {
  const saves = useSaves();
  const saved = useSavedStories();
  const [activeId, setActiveId] = useState<string | null>(null);
  const stories = saved.status === 'ready' ? saved.stories : [];
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
  // An unsaved card leaves the list, so the active card and focus move to its neighbour first.
  function toggleStory(storyId: string) {
    if (storyId === activeId) {
      const index = stories.findIndex(({ id }) => id === storyId);
      const neighbourId = (stories[index + 1] ?? stories[index - 1])?.id ?? null;
      setActiveId(neighbourId);
      if (neighbourId) focusStory(neighbourId);
    }
    saves.toggle(storyId);
  }
  function toggleActiveSave() {
    if (activeStory) toggleStory(activeStory.id);
  }

  useShortcut(NEXT_STORY, goToNext);
  useShortcut(PREVIOUS_STORY, goToPrevious);
  useShortcut(OPEN_ORIGINAL, openOriginal);
  useShortcut(OPEN_ORIGINAL_ENTER, openOriginalOnEnter);
  useShortcut(OPEN_DISCUSSION, openDiscussion);
  useShortcut(SAVE_STORY, toggleActiveSave);

  if (saved.status === 'loading') return <FeedSkeleton />;
  if (saved.status === 'error')
    return <FeedError message="Couldn't load your saved stories." onRetry={saved.retry} />;
  if (stories.length === 0) return <SavedEmpty />;

  return (
    <div role="feed" aria-label="Saved stories">
      {stories.map((story) => (
        <StoryCard
          key={story.id}
          story={story}
          isSaved={saves.isSaved(story.id)}
          onToggleSave={() => toggleStory(story.id)}
          isActive={story.id === activeId}
        />
      ))}
    </div>
  );
}
