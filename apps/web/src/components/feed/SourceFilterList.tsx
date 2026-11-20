'use client';

import { useQuery } from '@tanstack/react-query';
import { SOURCE_KINDS } from '@devbrief/shared';
import { Checkbox } from '@/components/ui/Checkbox';
import { formatRelativeTime } from '@/lib/format/formatRelativeTime';
import { sourcesQueryOptions } from './feedQueries';
import { HealthDot } from './HealthDot';
import { kindHealth, type KindHealth } from './sourceHealth';
import { SOURCE_KIND_LABELS } from './sourceKinds';
import { useFeedFilters } from './useFeedFilters';

function tooltipFor({ lastSuccessAt }: KindHealth) {
  if (!lastSuccessAt) return 'Not updated yet';
  return `Last updated ${formatRelativeTime(lastSuccessAt, new Date(), 'long')}`;
}

/** The source kinds as filters, each with a health dot (the worst status among its sources). */
export function SourceFilterList() {
  const { data } = useQuery(sourcesQueryOptions);
  const { filters, toggleKind } = useFeedFilters();

  return (
    <fieldset className="min-w-0">
      <legend className="text-muted-foreground px-2 pb-1 text-xs font-medium tracking-wide uppercase">
        Sources
      </legend>
      {SOURCE_KINDS.map((kind) => {
        const health = data ? kindHealth(data.sources, kind) : null;
        return (
          <div
            key={kind}
            data-kind={kind}
            className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1"
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <Checkbox checked={filters.kinds.includes(kind)} onChange={() => toggleKind(kind)} />
              <span className="flex-1 truncate">{SOURCE_KIND_LABELS[kind]}</span>
            </label>
            {health && <HealthDot status={health.status} tooltip={tooltipFor(health)} />}
          </div>
        );
      })}
    </fieldset>
  );
}
