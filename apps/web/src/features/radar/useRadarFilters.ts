'use client';

import { useMemo } from 'react';
import { useQueryStates } from 'nuqs';
import type { RadarMetric, RadarWindow, TagSlug } from '@devbrief/shared';
import { radarSearchParams, toRadarFilters } from './radarParams';

// Control changes replace the history entry, so Back leaves the radar instead of stepping through toggles.
const URL_OPTIONS = { history: 'replace' } as const;

/** The radar's window, metric and charted tags read from and written to the URL. */
export function useRadarFilters() {
  const [raw, setRaw] = useQueryStates(radarSearchParams, URL_OPTIONS);
  const { window, metric, tags } = raw;
  const filters = useMemo(() => toRadarFilters({ window, metric, tags }), [window, metric, tags]);

  function setWindow(next: RadarWindow) {
    return setRaw({ window: next });
  }
  function setMetric(next: RadarMetric) {
    return setRaw({ metric: next });
  }
  function setTags(next: TagSlug[]) {
    return setRaw({ tags: next });
  }

  return { filters, setWindow, setMetric, setTags };
}
