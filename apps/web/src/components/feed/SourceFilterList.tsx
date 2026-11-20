'use client';

import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/Checkbox';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatRelativeTime } from '@/lib/format/formatRelativeTime';
import { sourcesQueryOptions } from './feedQueries';
import { HealthDot } from './HealthDot';
import { listedKinds, type KindHealth } from './sourceHealth';
import { SOURCE_KIND_LABELS } from './sourceKinds';
import { useFeedFilters } from './useFeedFilters';

const PLACEHOLDER_ROWS = 3;

function tooltipFor({ lastSuccessAt }: KindHealth) {
  if (!lastSuccessAt) return 'Not updated yet';
  return `Last updated ${formatRelativeTime(lastSuccessAt, new Date(), 'long')}`;
}

/** The source kinds `/sources` lists, as filters, each with a health dot (the worst status among its sources). */
export function SourceFilterList() {
  const { data, isPending } = useQuery(sourcesQueryOptions);
  const { filters, toggleKind } = useFeedFilters();

  return (
    <fieldset className="min-w-0">
      <legend className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
        Sources
      </legend>
      {isPending &&
        Array.from({ length: PLACEHOLDER_ROWS }, (_, index) => (
          <Skeleton key={index} className="mx-2 my-1.5 h-4" />
        ))}
      {!isPending && !data && (
        <p className="text-muted-foreground px-2 py-1">Sources unavailable.</p>
      )}
      {data &&
        listedKinds(data.sources).map(({ kind, health }) => (
          <div
            key={kind}
            data-kind={kind}
            className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1"
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <Checkbox checked={filters.kinds.includes(kind)} onChange={() => toggleKind(kind)} />
              <span className="flex-1 truncate">{SOURCE_KIND_LABELS[kind]}</span>
            </label>
            <HealthDot status={health.status} tooltip={tooltipFor(health)} />
          </div>
        ))}
    </fieldset>
  );
}
