'use client';

import { useQuery } from '@tanstack/react-query';
import { TAG_LABELS, TAG_SLUGS } from '@devbrief/shared';
import { sourcesQueryOptions } from '@/components/feed/feedQueries';
import { listedKinds } from '@/components/feed/sourceHealth';
import { SOURCE_KIND_LABELS } from '@/components/feed/sourceKinds';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { SourceKindHeart } from './SourceKindHeart';
import { TagHeart } from './TagHeart';
import { usePreferences } from './usePreferences';

/** Every tag and source kind with its follow/mute heart, the same rows as the sidebar (PRD §7.3). */
export function FeedPreferencesSection() {
  const { isError, refetch } = usePreferences();
  const {
    data: sources,
    isPending: sourcesPending,
    isError: sourcesError,
  } = useQuery(sourcesQueryOptions);

  function retry() {
    void refetch();
  }

  return (
    <section aria-labelledby="feed-preferences-heading" className="flex flex-col gap-3">
      <h2 id="feed-preferences-heading" className="text-sm font-medium">
        Feed
      </h2>
      <p className="text-muted-foreground text-sm">
        Followed stories rank higher; muted ones never appear.
      </p>
      {isError && (
        <div role="alert" className="flex items-center gap-3">
          <p className="text-muted-foreground text-sm">Couldn&apos;t load your feed preferences.</p>
          <Button variant="outline" size="xs" onClick={retry}>
            Retry
          </Button>
        </div>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3
            id="tag-preferences-heading"
            className="text-muted-foreground pb-1 text-xs font-medium tracking-wide uppercase"
          >
            Tags
          </h3>
          <ul aria-labelledby="tag-preferences-heading" className="flex flex-col">
            {TAG_SLUGS.map((slug) => (
              <li
                key={slug}
                className="flex items-center justify-between gap-2 px-2 py-0.5 text-sm"
              >
                {TAG_LABELS[slug]}
                <TagHeart slug={slug} />
              </li>
            ))}
          </ul>
        </div>
        <div className="self-start">
          <h3
            id="source-preferences-heading"
            className="text-muted-foreground pb-1 text-xs font-medium tracking-wide uppercase"
          >
            Sources
          </h3>
          {sourcesPending && <Skeleton className="mx-2 my-1.5 h-4" />}
          {sourcesError && (
            <p className="text-muted-foreground px-2 py-1 text-sm">Sources unavailable.</p>
          )}
          {sources && (
            <ul aria-labelledby="source-preferences-heading" className="flex flex-col">
              {listedKinds(sources.sources).map(({ kind }) => (
                <li
                  key={kind}
                  className="flex items-center justify-between gap-2 px-2 py-0.5 text-sm"
                >
                  {SOURCE_KIND_LABELS[kind]}
                  <SourceKindHeart kind={kind} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
