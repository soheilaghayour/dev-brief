'use client';

import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/Checkbox';
import { Skeleton } from '@/components/ui/Skeleton';
import { tagsQueryOptions } from './feedQueries';
import { useFeedFilters } from './useFeedFilters';

const PLACEHOLDER_ROWS = 8;

/** Every tag with its 7-day story count; ticking one filters the feed by it. */
export function TagFilterList() {
  const { data, isPending } = useQuery(tagsQueryOptions);
  const { filters, toggleTag } = useFeedFilters();

  return (
    <fieldset className="min-w-0">
      <legend className="text-muted-foreground flex w-full justify-between px-2 pb-1 text-xs font-medium tracking-wide uppercase">
        <span>Tags</span>
        <span>7d</span>
      </legend>
      {isPending &&
        Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
          <Skeleton key={index} className="mx-2 my-1.5 h-4" />
        ))}
      {!isPending && !data && <p className="text-muted-foreground px-2 py-1">Tags unavailable.</p>}
      {data?.tags.map(({ slug, label, count7d }) => (
        <label key={slug} className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1">
          <Checkbox checked={filters.tags.includes(slug)} onChange={() => toggleTag(slug)} />
          <span className="flex-1 truncate">{label}</span>
          <span className="text-muted-foreground text-xs tabular-nums">{count7d}</span>
        </label>
      ))}
    </fieldset>
  );
}
