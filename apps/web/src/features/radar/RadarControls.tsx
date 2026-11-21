'use client';

import { ToggleGroup } from '@/components/ui/ToggleGroup';
import { useRadarFilters } from './useRadarFilters';

const WINDOW_OPTIONS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
] as const;

const METRIC_OPTIONS = [
  { value: 'stories', label: 'Stories' },
  { value: 'engagement', label: 'Engagement' },
] as const;

/** The 7d / 30d and Stories / Engagement toggles; they write the URL. */
export function RadarControls() {
  const { filters, setWindow, setMetric } = useRadarFilters();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ToggleGroup
        label="Window"
        options={WINDOW_OPTIONS}
        value={filters.window}
        onValueChange={setWindow}
      />
      <ToggleGroup
        label="Metric"
        options={METRIC_OPTIONS}
        value={filters.metric}
        onValueChange={setMetric}
      />
    </div>
  );
}
