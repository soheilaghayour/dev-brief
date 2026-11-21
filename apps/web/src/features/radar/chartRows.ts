import type { Radar } from '@devbrief/shared';

export type VelocitySeries = Radar['series'];

/** A chart row: its date plus one value per tag slug. */
export type ChartRow = { date: string } & Record<string, number | string>;

/** Pivots the per-tag series into one row per date, oldest first; the chart and the table read the same rows. */
export function toChartRows(series: VelocitySeries): ChartRow[] {
  const byDate = new Map<string, ChartRow>();
  for (const { tag, points } of series) {
    for (const { date, value } of points) {
      const row = byDate.get(date) ?? { date };
      row[tag] = value;
      byDate.set(date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** "Nov 13" for a `YYYY-MM-DD` UTC day. */
export function formatDay(date: string) {
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}
