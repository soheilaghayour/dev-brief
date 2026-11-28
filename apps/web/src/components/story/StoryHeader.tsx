import Link from 'next/link';
import { ArrowLeftIcon, ExternalLinkIcon } from 'lucide-react';
import type { StoryDetail } from '@devbrief/shared';
import { RelativeTime } from '@/components/feed/RelativeTime';
import { TagBadge } from '@/components/feed/TagBadge';
import { Button } from '@/components/ui/Button';
import { StorySaveButton } from './StorySaveButton';

export function StoryHeader({ story }: { story: StoryDetail }) {
  return (
    <header className="flex flex-col gap-3">
      <Link
        href="/feed"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 self-start rounded-sm text-xs"
      >
        <ArrowLeftIcon className="size-3.5" aria-hidden="true" /> Back to feed
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="max-w-3xl text-xl leading-snug font-semibold tracking-tight">
          {story.title}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <StorySaveButton storyId={story.id} title={story.title} />
          <Button variant="outline" asChild>
            <a href={story.url} target="_blank" rel="noopener noreferrer">
              Open <ExternalLinkIcon aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
        <span>{story.domain}</span>
        <span aria-hidden="true">·</span>
        <span>
          published <RelativeTime iso={story.publishedAt} style="long" />
        </span>
        <span aria-hidden="true">·</span>
        <span>
          first seen <RelativeTime iso={story.firstSeenAt} style="long" />
        </span>
        {story.tags.map((tag) => (
          <TagBadge key={tag} slug={tag} />
        ))}
      </p>
      {story.excerpt && <p className="max-w-3xl leading-relaxed">{story.excerpt}</p>}
    </header>
  );
}
