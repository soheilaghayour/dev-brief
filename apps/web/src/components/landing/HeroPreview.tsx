'use client';

// The window itself takes focus and the keys (PRD §2.3), so it is a focusable keyboard region.
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import { ArrowRightIcon } from 'lucide-react';
import { TAG_LABELS, type StoryCard as StoryCardData } from '@devbrief/shared';
import { StoryCard } from '@/components/feed/StoryCard';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/cn';
import {
  PREVIEW_TAGS,
  feedFocusHref,
  moveActiveIndex,
  visibleStories,
  type PreviewTag,
} from './previewLogic';
import { usePreviewSaves } from './usePreviewSaves';

type HeroPreviewProps = {
  /** The last 24 h of top stories, embedded in the static HTML. */
  stories: readonly StoryCardData[];
  /** The count behind "Showing 6 of N stories today". */
  storiesToday: number;
  isSample: boolean;
  host: string;
};

const MODIFIER_KEYS = ['ctrlKey', 'metaKey', 'altKey'] as const;

/** The product window of the hero: filter chips, the feed's top stories and the feed's j/k/s/Enter keys. */
export function HeroPreview({ stories, storiesToday, isSample, host }: HeroPreviewProps) {
  const router = useRouter();
  const saves = usePreviewSaves();
  const [tag, setTag] = useState<PreviewTag>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  const shown = visibleStories(stories, tag);
  const activeStory = shown[activeIndex];

  function chooseTag(next: PreviewTag) {
    setTag(next);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (MODIFIER_KEYS.some((modifier) => event[modifier])) return;
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      setActiveIndex(moveActiveIndex(activeIndex, event.key, shown.length));
    } else if (event.key === 's' && activeStory) {
      event.preventDefault();
      saves.toggle(activeStory.id);
    } else if (event.key === 'Enter' && event.target === event.currentTarget && activeStory) {
      // Enter on a chip or a link keeps its own meaning; only the window itself opens the card.
      event.preventDefault();
      router.push(feedFocusHref(activeStory.id));
    }
  }

  function handleFocus() {
    setIsFocused(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false);
  }

  return (
    <div
      role="group"
      aria-label="Live feed preview"
      aria-keyshortcuts="J K S Enter"
      tabIndex={0}
      data-saves-ready={saves.isReady}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="bg-card/80 relative overflow-hidden rounded-xl border shadow-2xl shadow-black/10 ring-1 ring-white/5 dark:shadow-black/40"
    >
      <div className="from-primary/0 via-primary/60 to-primary/0 absolute inset-x-8 top-0 h-px bg-gradient-to-r" />
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
        </div>
        <span className="text-muted-foreground font-mono text-xs">{host}/feed</span>
        {isSample && (
          <span className="text-muted-foreground ml-auto rounded-sm border px-1.5 text-[11px] leading-5">
            Sample data
          </span>
        )}
      </div>
      <div role="group" aria-label="Filter by tag" className="flex flex-wrap gap-1.5 px-3 pt-3">
        {PREVIEW_TAGS.map((slug) => (
          <TagChip
            key={slug}
            label={slug === 'all' ? 'All' : TAG_LABELS[slug]}
            slug={slug}
            isSelected={tag === slug}
            onChoose={chooseTag}
          />
        ))}
      </div>
      <div key={tag} className="mt-2 min-h-[26rem] text-left">
        {shown.length === 0 && (
          <p className="text-muted-foreground px-4 py-10 text-center">
            No stories with this tag in the last 24 hours.
          </p>
        )}
        {shown.map((story, index) => (
          <div
            key={story.id}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-backwards"
            style={{ animationDelay: `${index * 30}ms` }}
          >
            <StoryCard
              story={story}
              compact
              isActive={isFocused && index === activeIndex}
              isSaved={saves.isSaved(story.id)}
              onToggleSave={() => saves.toggle(story.id)}
            />
          </div>
        ))}
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t px-4 py-2.5 text-xs">
        <p className="flex items-center gap-1.5" aria-hidden="true">
          <Kbd size="sm">J</Kbd>
          <Kbd size="sm">K</Kbd>
          <span>to navigate</span>
          <span>·</span>
          <Kbd size="sm">S</Kbd>
          <span>to save</span>
          <span>·</span>
          <Kbd size="sm">Enter</Kbd>
          <span>to open</span>
        </p>
        <Link
          href="/feed"
          className="text-foreground group inline-flex items-center gap-1 rounded-sm font-medium"
        >
          Showing {shown.length} of {storiesToday} stories today
          <span className="inline-flex items-center gap-0.5">
            Open full feed
            <ArrowRightIcon
              className="size-3 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </span>
        </Link>
      </div>
    </div>
  );
}

type TagChipProps = {
  label: string;
  slug: PreviewTag;
  isSelected: boolean;
  onChoose: (slug: PreviewTag) => void;
};

function TagChip({ label, slug, isSelected, onChoose }: TagChipProps) {
  function choose() {
    onChoose(slug);
  }

  return (
    <Button
      variant="outline"
      size="xs"
      aria-pressed={isSelected}
      onClick={choose}
      className={cn(
        'text-muted-foreground rounded-full',
        isSelected && 'bg-accent text-accent-foreground border-primary/40',
      )}
    >
      {label}
    </Button>
  );
}
