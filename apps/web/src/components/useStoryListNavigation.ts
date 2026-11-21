'use client';

import { useState } from 'react';
import type { StoryCard } from '@devbrief/shared';
import {
  discussionUrl,
  isEnterOnInteractiveElement,
  moveActiveId,
} from '@/components/feed/feedNavigation';
import type { ToggleSaveOptions } from '@/components/saves/unsaveRequest';
import { focusStory, openInNewTab, scrollToStory } from '@/components/storyListDom';
import { useShortcut } from '@/lib/hotkeys/HotkeysProvider';
import type { Shortcut } from '@/lib/hotkeys/shortcutRules';

function listShortcuts(prefix: string, scope: string) {
  return {
    next: { id: `${prefix}-next`, keys: 'j', description: 'Next story', scope },
    previous: { id: `${prefix}-previous`, keys: 'k', description: 'Previous story', scope },
    open: {
      id: `${prefix}-open`,
      keys: 'o',
      description: 'Open the original in a new tab',
      scope,
    },
    openEnter: {
      id: `${prefix}-open-enter`,
      keys: 'enter',
      description: 'Open the original in a new tab',
      scope,
    },
    discussion: {
      id: `${prefix}-discussion`,
      keys: 'c',
      description: 'Open the discussion in a new tab',
      scope,
    },
    save: { id: `${prefix}-save`, keys: 's', description: 'Save or unsave the story', scope },
  } satisfies Record<string, Shortcut>;
}

export const SAVED_SHORTCUTS = listShortcuts('saved', 'Saved');
export const BOARD_SHORTCUTS = listShortcuts('board', 'Collection board');

type StoryListNavigationOptions = {
  stories: readonly StoryCard[];
  shortcuts: ReturnType<typeof listShortcuts>;
  onToggleSave: (storyId: string, options: ToggleSaveOptions) => void;
};

/** j/k, o, Enter, c and s over a list of cards that can lose a card at any time (Saved, a board). */
export function useStoryListNavigation({
  stories,
  shortcuts,
  onToggleSave,
}: StoryListNavigationOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
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
  // A card that leaves the list takes the active card with it, so the active card and focus move to its neighbour first.
  function leaveStory(storyId: string) {
    if (storyId !== activeId) return;
    const index = stories.findIndex(({ id }) => id === storyId);
    const neighbourId = (stories[index + 1] ?? stories[index - 1])?.id ?? null;
    setActiveId(neighbourId);
    if (neighbourId) focusStory(neighbourId);
  }
  // The card leaves only once the unsave happens: a cancelled confirmation keeps the active card and focus.
  function toggleStory(storyId: string) {
    const story = stories.find(({ id }) => id === storyId);
    if (!story) return;
    onToggleSave(storyId, {
      title: story.title,
      onUnsave: () => leaveStory(storyId),
    });
  }
  function toggleActiveSave() {
    if (activeStory) toggleStory(activeStory.id);
  }

  useShortcut(shortcuts.next, goToNext);
  useShortcut(shortcuts.previous, goToPrevious);
  useShortcut(shortcuts.open, openOriginal);
  useShortcut(shortcuts.openEnter, openOriginalOnEnter);
  useShortcut(shortcuts.discussion, openDiscussion);
  useShortcut(shortcuts.save, toggleActiveSave);

  return { activeId, leaveStory, toggleStory };
}
