import type { StoryCard as StoryCardData } from '@devbrief/shared';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { FolderPlusIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { isFeatureEnabled } from '@/config/features';
import { cn } from '@/lib/cn';
import type { ClusterSourceLineProps } from './ClusterSourceLine';
import { RelativeTime } from './RelativeTime';
import type { RelatedToggleProps } from './RelatedToggle';
import { SaveButton } from '@/components/saves/SaveButton';
import { SourceBadge } from './SourceBadge';
import { TagBadge } from './TagBadge';

const MAX_VISIBLE_TAGS = 3;
const TITLE_CLASS = 'text-foreground rounded-sm text-base font-medium hover:underline';

/** The fields the card renders; the landing preview sends only these to the browser. */
export type CardStory = Omit<StoryCardData, 'excerpt' | 'author' | 'rankScore' | 'canSummarize'>;

type StoryCardProps = {
  story: CardStory;
  isSaved: boolean;
  onToggleSave: () => void;
  /** Denser rows for previews: tags stay, the reading time goes. */
  compact?: boolean;
  /** The card j/k currently points at. */
  isActive?: boolean;
  /** The Follow / Mute menu the tag and source badges open; absent where preferences don't apply, like the landing preview. */
  preferenceMenu?: ComponentProps<typeof TagBadge>['menu'];
  /** The "+N related" control of a cluster card: the feed's expanding toggle or the landing preview's static link; passed in, so pages without clusters (/saved) load neither. */
  relatedToggle?: ComponentType<RelatedToggleProps>;
  /** The combined source line of a cluster card, in place of the per-source badges; passed in for the same reason as `relatedToggle`. */
  sourceLine?: ComponentType<ClusterSourceLineProps>;
  /** Opens "Add to collection"; absent where collections are off or unavailable, so the card shows no entry. */
  onAddToCollection?: () => void;
  /** Where the title links in the same tab, such as the landing preview's story page; absent, it opens the original in a new tab. */
  titleHref?: string;
  /** Extra controls beside the save button, such as a board's "Remove from collection". */
  actions?: ReactNode;
  /** A slot under the card's content, such as a board's note preview. */
  note?: ReactNode;
};

export function StoryCard({
  story,
  isSaved,
  onToggleSave,
  compact = false,
  isActive = false,
  preferenceMenu,
  relatedToggle: RelatedToggle,
  sourceLine: SourceLine,
  onAddToCollection,
  titleHref,
  actions,
  note,
}: StoryCardProps) {
  const cluster = isFeatureEnabled('clusters') ? story.cluster : null;
  const visibleTags = story.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = story.tags.length - visibleTags.length;
  return (
    <article
      data-story-id={story.id}
      data-active={isActive}
      className={cn(
        'relative flex scroll-mt-16 items-start gap-2 border-b px-3 transition-colors ring-inset',
        'data-[active=true]:bg-accent/50 data-[active=true]:ring-ring data-[active=true]:ring-2',
        'before:bg-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:opacity-0 data-[active=true]:before:opacity-100',
        compact ? 'py-2' : 'py-3',
      )}
    >
      <div className="min-w-0 flex-1">
        <h2 className="leading-snug">
          {titleHref ? (
            // Thirty preview titles would otherwise prefetch thirty dynamic story pages on every landing visit.
            <Link href={titleHref} prefetch={false} className={TITLE_CLASS}>
              {story.title}
            </Link>
          ) : (
            <a href={story.url} target="_blank" rel="noopener noreferrer" className={TITLE_CLASS}>
              {story.title}
            </a>
          )}
          <span className="text-muted-foreground ml-2 text-xs whitespace-nowrap">
            {story.domain}
          </span>
        </h2>
        {story.summaryLine && isFeatureEnabled('summaries') && (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
            <span className="sr-only">AI summary: </span>
            {story.summaryLine}
          </p>
        )}
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {cluster && SourceLine ? (
            <SourceLine sources={cluster.sources} />
          ) : (
            story.sources.map((source) => (
              <SourceBadge
                key={`${source.slug}:${source.itemUrl}`}
                source={source}
                menu={preferenceMenu}
              />
            ))
          )}
          <RelativeTime iso={story.publishedAt} />
          {!compact && story.readingTimeMinutes !== null && (
            <span>{story.readingTimeMinutes} min read</span>
          )}
          {visibleTags.map((tag) => (
            <TagBadge key={tag} slug={tag} menu={preferenceMenu} />
          ))}
          {hiddenTagCount > 0 && <span>+{hiddenTagCount}</span>}
          {story.hasSummary && isFeatureEnabled('summaries') && (
            <Link href={`/story/${story.id}`} aria-label={`Read the AI summary of ${story.title}`}>
              <Badge>TL;DR</Badge>
            </Link>
          )}
        </div>
        {cluster && RelatedToggle && (
          <RelatedToggle
            storyId={story.id}
            clusterId={cluster.id}
            memberCount={cluster.memberCount}
          />
        )}
        {note}
      </div>
      {onAddToCollection && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Add to collection"
          title="Add to collection (A)"
          onClick={onAddToCollection}
        >
          <FolderPlusIcon aria-hidden="true" />
        </Button>
      )}
      {actions}
      <SaveButton isSaved={isSaved} onToggleSave={onToggleSave} />
    </article>
  );
}
