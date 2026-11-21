'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RADAR_TAGS_MAX } from '@devbrief/shared';
import type { Radar, TagSlug } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { MoversTable, type MoverRow } from './MoversTable';
import { RadarControls } from './RadarControls';
import { radarQueryOptions } from './radarQueries';
import { TechVelocityChart } from '@/components/radar/TechVelocityChart';
import { useRadarFilters } from './useRadarFilters';

function RadarSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Skeleton className="h-72" />
      <Skeleton className="h-72" />
    </div>
  );
}

/** The movers, plus a row for each charted tag that is not among them, so it can still be unticked. */
function moverRows({ movers, series }: Radar, selected: readonly TagSlug[]): MoverRow[] {
  const missing = series
    .filter(({ tag }) => selected.includes(tag) && !movers.some((mover) => mover.tag === tag))
    .map(({ tag, label, points }) => ({
      tag,
      label,
      current: points.reduce((total, { value }) => total + value, 0),
      previous: null,
      deltaPct: null,
    }));
  return [...movers, ...missing];
}

/** The radar: controls, the movers table and the trend chart, all driven by the URL. */
export function RadarPage() {
  const { filters, setTags } = useRadarFilters();
  // The previous data stays on screen while a toggle's data loads, so the table does not flash empty.
  const radar = useQuery({ ...radarQueryOptions(filters), placeholderData: keepPreviousData });

  // Without `tags` in the URL the API charts the top movers, so those are the ticked rows; placeholder data would tick the previous query's.
  const topMovers = radar.isPlaceholderData ? [] : (radar.data?.series.map(({ tag }) => tag) ?? []);
  const selected = filters.tags.length > 0 ? filters.tags : topMovers;
  const rows = radar.data ? moverRows(radar.data, selected) : [];

  function toggleTag(tag: TagSlug) {
    const next = selected.includes(tag)
      ? selected.filter((existing) => existing !== tag)
      : [...selected, tag].slice(0, RADAR_TAGS_MAX);
    return setTags(next);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Tech Radar</h1>
        <RadarControls />
      </div>
      {radar.data ? (
        <div aria-busy={radar.isPlaceholderData} className="grid items-start gap-6 lg:grid-cols-2">
          <section aria-labelledby="movers-title" className="bg-card rounded-lg border p-4">
            <h2 id="movers-title" className="mb-2 font-medium">
              Top movers
            </h2>
            {rows.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tag activity in this window yet.</p>
            ) : (
              <MoversTable
                movers={rows}
                selected={selected}
                onToggleTag={toggleTag}
                isStale={radar.isPlaceholderData}
              />
            )}
          </section>
          <div className="bg-card rounded-lg border p-4">
            <TechVelocityChart
              title="Velocity"
              window={radar.data.window}
              metric={radar.data.metric}
              series={radar.data.series}
            />
          </div>
        </div>
      ) : radar.isError ? (
        <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <p className="text-muted-foreground">The radar could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => radar.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <RadarSkeleton />
      )}
    </div>
  );
}
