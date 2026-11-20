'use client';

import { useQuery } from '@tanstack/react-query';
import { sourcesQueryOptions } from './feedQueries';
import { HealthDot } from './HealthDot';
import { countUnhealthy } from './sourceHealth';

/** One line under the filters: all sources healthy, or how many need attention. */
export function SourceStatus() {
  const { data } = useQuery(sourcesQueryOptions);
  if (!data) return null;
  const unhealthy = countUnhealthy(data.sources);
  const text =
    unhealthy === 0
      ? 'All sources up to date'
      : `${unhealthy} of ${data.sources.length} sources behind`;

  return (
    <p id="source-status" className="text-muted-foreground flex items-center gap-2 px-2 text-xs">
      <HealthDot status={unhealthy === 0 ? 'healthy' : 'stale'} tooltip={text} />
      {text}
    </p>
  );
}
