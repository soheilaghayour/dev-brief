'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/Checkbox';
import { Skeleton } from '@/components/ui/Skeleton';
import { TagHeart } from '@/components/preferences/TagHeart';
import { usePreferenceState } from '@/components/preferences/usePreferenceState';
import { personalisedTagsPlaceholder, tagsQueryOptions } from './feedQueries';
import { useFeedFilters } from './useFeedFilters';

const PLACEHOLDER_ROWS = 8;

/** Every tag with the number of stories the feed lists for it; ticking one filters the feed by it. */
export function TagFilterList() {
  const { filters, toggleTag } = useFeedFilters();
  const { feedParams } = usePreferenceState();
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    ...tagsQueryOptions(filters, feedParams),
    placeholderData: personalisedTagsPlaceholder(queryClient, filters),
  });

  return (
    <fieldset className="min-w-0">
      <legend className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
        Tags
      </legend>
      {isPending &&
        Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
          <Skeleton key={index} className="mx-2 my-1.5 h-4" />
        ))}
      {!isPending && !data && <p className="text-muted-foreground px-2 py-1">Tags unavailable.</p>}
      {data?.tags.map(({ slug, label, count }) => (
        <div key={slug} className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <Checkbox checked={filters.tags.includes(slug)} onChange={() => toggleTag(slug)} />
            <span className="flex-1 truncate">{label}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
          </label>
          <TagHeart slug={slug} />
        </div>
      ))}
    </fieldset>
  );
}
