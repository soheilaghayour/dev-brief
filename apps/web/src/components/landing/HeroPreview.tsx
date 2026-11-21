'use client';

// The window itself takes focus and the keys (PRD §2.3), so it is a focusable keyboard region.
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { lazy, Suspense, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import { ArrowRightIcon } from 'lucide-react';
import { TAG_LABELS } from '@devbrief/shared';
import { ClusterSourceLine } from '@/components/feed/ClusterSourceLine';
import type { RelatedToggleProps } from '@/components/feed/RelatedToggle';
import { StoryCard, type CardStory } from '@/components/feed/StoryCard';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { cn } from '@/lib/cn';
import type { ExampleBriefing } from './exampleBriefingData';
import { PANEL_STYLE, SELECTED_TAB_CLASS } from './exampleTabStyles';
import {
  PREVIEW_TAGS,
  moveActiveIndex,
  scrollTopToReveal,
  storyHref,
  visibleStories,
  type PreviewTag,
} from './previewLogic';
import { usePreviewSaves } from './usePreviewSaves';

type HeroPreviewProps = {
  /** The last 24 h of top stories (up to 30), embedded in the static HTML. */
  stories: readonly CardStory[];
  /** The count behind "Showing 30 of N stories today"; absent when the stats endpoint failed. */
  storiesToday: number | undefined;
  isSample: boolean;
  host: string;
  /** Example briefing #1; present only while the copilot flag is on, and it adds the Feed | Briefing switch. */
  briefing?: ExampleBriefing;
  briefingIsSample?: boolean;
};

// Loads with the Briefing control, so the renderer's wrapper stays out of the landing's first load.
const HeroBriefing = lazy(() => import('./HeroBriefing'));

const VIEW_OPTIONS = [
  { value: 'feed', label: 'Feed' },
  { value: 'briefing', label: 'Briefing' },
] as const;

const MODIFIER_KEYS = ['ctrlKey', 'metaKey', 'altKey'] as const;

// The frame shows about five cards; the ones after these skip layout and paint until scrolled near.
const CARDS_ABOVE_FOLD = 6;
// A compact card with a summary line, so the frame's scrollbar barely moves when a skipped card renders.
const OFFSCREEN_CARD_CLASS = '[content-visibility:auto] [contain-intrinsic-size:auto_6rem]';
// The list animates in on a chip change; past the fold, a longer stagger would only delay cards nobody sees yet.
const MAX_STAGGERED_CARDS = 8;

/** The product window of the hero: filter chips, the feed's top stories and the feed's j/k/s/Enter keys. */
export function HeroPreview({
  stories,
  storiesToday,
  isSample,
  host,
  briefing,
  briefingIsSample = false,
}: HeroPreviewProps) {
  const router = useRouter();
  const saves = usePreviewSaves();
  const [tag, setTag] = useState<PreviewTag>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [hasChosenTag, setHasChosenTag] = useState(false);
  const [view, setView] = useState<'feed' | 'briefing'>('feed');
  const frameRef = useRef<HTMLDivElement>(null);
  const isBriefing = view === 'briefing' && briefing !== undefined;

  const shown = visibleStories(stories, tag);
  const activeStory = shown[activeIndex];

  function chooseTag(next: PreviewTag) {
    setTag(next);
    setHasChosenTag(true);
    setActiveIndex(0);
  }

  // Scrolls the frame only: scrollIntoView would also scroll the page to bring the frame into view.
  function revealCard(index: number) {
    const frame = frameRef.current;
    const card = frame?.querySelectorAll('article[data-story-id]')[index];
    if (!frame || !card) return;
    const cardBox = card.getBoundingClientRect();
    const frameTop = frame.getBoundingClientRect().top + frame.clientTop;
    frame.scrollTop = scrollTopToReveal(
      { scrollTop: frame.scrollTop, height: frame.clientHeight },
      { top: cardBox.top - frameTop + frame.scrollTop, height: cardBox.height },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isBriefing) return;
    if (MODIFIER_KEYS.some((modifier) => event[modifier])) return;
    if (event.key === 'j' || event.key === 'k') {
      event.preventDefault();
      const next = moveActiveIndex(activeIndex, event.key, shown.length);
      setActiveIndex(next);
      revealCard(next);
    } else if (event.key === 's' && activeStory) {
      event.preventDefault();
      saves.toggle(activeStory.id);
    } else if (event.key === 'Enter' && event.target === event.currentTarget && activeStory) {
      // Enter on a chip or a link keeps its own meaning; only the window itself opens the card.
      event.preventDefault();
      router.push(storyHref(activeStory.id));
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
      aria-keyshortcuts={isBriefing ? undefined : 'J K S Enter'}
      tabIndex={0}
      data-saves-ready={saves.isReady}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="bg-card/80 relative overflow-hidden rounded-xl border shadow-overlay/20 dark:shadow-overlay ring-border/50 shadow-2xl ring-1"
    >
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
        </div>
        <span className="text-muted-foreground font-mono text-xs">{host}/feed</span>
        {/* A live region that always exists is announced reliably; a label that mounts with the view is not. */}
        <span role="status" className="ml-auto">
          {(isBriefing ? briefingIsSample : isSample) && (
            <span className="text-muted-foreground rounded-sm border px-1.5 text-[11px] leading-5">
              Sample data
            </span>
          )}
        </span>
      </div>
      {briefing && (
        <ToggleGroup
          label="Preview view"
          options={VIEW_OPTIONS}
          value={view}
          onValueChange={setView}
          className="mx-3 mt-3 w-fit"
        />
      )}
      {/* One fixed height for both views, every chip and an empty list, so nothing below the window moves; the list and the briefing scroll inside it. */}
      <div data-preview-body className="flex h-[28.25rem] flex-col">
        {isBriefing ? (
          <div
            role="region"
            aria-label={briefing.question}
            tabIndex={0}
            style={PANEL_STYLE}
            className="isolate mt-2 min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-left"
          >
            <div className="pt-3">
              {/* A one-block stand-in for BriefingSkeleton, which would add 0.13 KB to the landing's budgeted first load. */}
              <Suspense
                fallback={
                  <div
                    role="status"
                    aria-label="Preparing your briefing"
                    className="bg-muted h-24 animate-pulse rounded-md"
                  />
                }
              >
                <HeroBriefing briefing={briefing} />
              </Suspense>
            </div>
          </div>
        ) : (
          <>
            <div
              role="group"
              aria-label="Filter by tag"
              className="flex flex-wrap gap-1.5 px-3 pt-3"
            >
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
            {/* Keyed by the chip, so a new chip starts the list at its top. */}
            <div
              key={tag}
              ref={frameRef}
              data-preview-frame
              className="mt-2 min-h-0 flex-1 overflow-y-auto text-left"
            >
              {shown.length === 0 && (
                <p className="text-muted-foreground px-4 py-10 text-center">
                  No stories with this tag in the last 24 hours.
                </p>
              )}
              {shown.map((story, index) => (
                <div
                  key={story.id}
                  className={cn(
                    index >= CARDS_ABOVE_FOLD && OFFSCREEN_CARD_CLASS,
                    hasChosenTag &&
                      'animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards duration-300',
                  )}
                  style={
                    hasChosenTag
                      ? { animationDelay: `${Math.min(index, MAX_STAGGERED_CARDS) * 30}ms` }
                      : undefined
                  }
                >
                  <StoryCard
                    story={story}
                    compact
                    titleHref={storyHref(story.id)}
                    sourceLine={ClusterSourceLine}
                    relatedToggle={RelatedLink}
                    isActive={isFocused && index === activeIndex}
                    isSaved={saves.isSaved(story.id)}
                    onToggleSave={() => saves.toggle(story.id)}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {/* Always two rows: on one wrapping row, the story count, which the Briefing view drops, would decide the footer's height. */}
      <div className="text-muted-foreground flex flex-col items-start gap-2 border-t px-4 py-2.5 text-xs">
        <p
          className={cn('flex items-center gap-1.5', isBriefing && 'invisible')}
          aria-hidden="true"
        >
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
          {!isBriefing &&
            (storiesToday === undefined
              ? `Showing ${shown.length} stories`
              : `Showing ${shown.length} of ${storiesToday} stories today`)}
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

/** A cluster card's "+N related": it links to the story page instead of expanding, since the feed's toggle needs TanStack Query, which the landing doesn't load. */
function RelatedLink({ storyId, memberCount }: RelatedToggleProps) {
  return (
    <Link
      href={storyHref(storyId)}
      prefetch={false}
      className="text-muted-foreground mt-1.5 inline-block rounded-sm text-xs hover:underline"
    >
      +{memberCount - 1} related
    </Link>
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
      className={cn('text-muted-foreground rounded-full', isSelected && SELECTED_TAB_CLASS)}
    >
      {label}
    </Button>
  );
}
