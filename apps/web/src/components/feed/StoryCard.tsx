import type { StoryCard as StoryCardData } from '@devbrief/shared';
import { cn } from '@/lib/cn';
import { RelativeTime } from './RelativeTime';
import { SaveButton } from '@/components/saves/SaveButton';
import { SourceBadge } from './SourceBadge';
import { TagBadge } from './TagBadge';

const MAX_VISIBLE_TAGS = 3;

type StoryCardProps = {
  story: StoryCardData;
  isSaved: boolean;
  onToggleSave: () => void;
  /** Denser rows for previews: tags stay, the reading time goes. */
  compact?: boolean;
  /** The card j/k currently points at. */
  isActive?: boolean;
};

export function StoryCard({
  story,
  isSaved,
  onToggleSave,
  compact = false,
  isActive = false,
}: StoryCardProps) {
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
          <a
            href={story.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground rounded-sm text-base font-medium hover:underline"
          >
            {story.title}
          </a>
          <span className="text-muted-foreground ml-2 text-xs whitespace-nowrap">
            {story.domain}
          </span>
        </h2>
        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {story.sources.map((source) => (
            <SourceBadge key={`${source.slug}:${source.itemUrl}`} source={source} />
          ))}
          <RelativeTime iso={story.publishedAt} />
          {!compact && story.readingTimeMinutes !== null && (
            <span>{story.readingTimeMinutes} min read</span>
          )}
          {visibleTags.map((tag) => (
            <TagBadge key={tag} slug={tag} />
          ))}
          {hiddenTagCount > 0 && <span>+{hiddenTagCount}</span>}
        </div>
      </div>
      <SaveButton isSaved={isSaved} onToggleSave={onToggleSave} />
    </article>
  );
}
