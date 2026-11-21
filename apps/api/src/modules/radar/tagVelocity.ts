import {
  TAG_LABELS,
  TAG_SLUGS,
  type Radar,
  type RadarMetric,
  type RadarWindow,
  type TagSlug,
} from '@devbrief/shared';

/** The fields of a `TagDailyStat` row the velocity math reads. */
export type TagDayStat = { day: Date; tag: string; storyCount: number; engagementSum: number };

export type TagVelocityInput = {
  stats: readonly TagDayStat[];
  window: RadarWindow;
  metric: RadarMetric;
  now: Date;
  /** The series to return; without it, the top movers. */
  tags?: readonly TagSlug[];
};

const DAY_MS = 86_400_000;
const WINDOW_DAYS = { '7d': 7, '30d': 30 } as const satisfies Record<RadarWindow, number>;
const DEFAULT_SERIES_COUNT = 5;

const dayKey = (dayMs: number) => new Date(dayMs).toISOString().slice(0, 10);

const utcMidnight = (now: Date) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

/** The first UTC day a stat can count for: the start of the previous window. */
export function radarStartDay(window: RadarWindow, now: Date) {
  return new Date(utcMidnight(now) - (2 * WINDOW_DAYS[window] - 1) * DAY_MS);
}

/** The `days` UTC days ending at `endDayMs`, oldest first, as `YYYY-MM-DD`. */
function windowDays(days: number, endDayMs: number) {
  return Array.from({ length: days }, (_, index) => dayKey(endDayMs - (days - 1 - index) * DAY_MS));
}

function deltaPct(current: number, previous: number) {
  if (previous === 0) return null;
  // + 0 turns -0 (a tiny drop that rounds to zero) into 0.
  return Math.round(((current - previous) / previous) * 100) + 0;
}

/** Builds the radar series and movers for the N UTC days ending today against the N days before them. */
export function computeTagVelocity({ stats, window, metric, now, tags }: TagVelocityInput): Radar {
  const days = WINDOW_DAYS[window];
  const todayMs = utcMidnight(now);
  const currentDays = windowDays(days, todayMs);
  const previousDays = windowDays(days, todayMs - days * DAY_MS);

  const valueByTagDay = new Map<string, number>();
  for (const stat of stats) {
    const value = metric === 'stories' ? stat.storyCount : stat.engagementSum;
    const key = `${stat.tag}|${dayKey(stat.day.getTime())}`;
    valueByTagDay.set(key, (valueByTagDay.get(key) ?? 0) + value);
  }
  const valueOn = (tag: TagSlug, day: string) => valueByTagDay.get(`${tag}|${day}`) ?? 0;
  const total = (tag: TagSlug, windowOfDays: readonly string[]) =>
    windowOfDays.reduce((sum, day) => sum + valueOn(tag, day), 0);

  const movers = TAG_SLUGS.map((tag) => {
    const current = total(tag, currentDays);
    const previous = total(tag, previousDays);
    return {
      tag,
      label: TAG_LABELS[tag],
      current,
      previous,
      deltaPct: deltaPct(current, previous),
    };
  })
    .filter(({ current, previous }) => current !== 0 || previous !== 0)
    .sort(
      (a, b) =>
        Math.abs(b.current - b.previous) - Math.abs(a.current - a.previous) ||
        (a.tag < b.tag ? -1 : 1),
    );

  const seriesTags = tags ?? movers.slice(0, DEFAULT_SERIES_COUNT).map(({ tag }) => tag);
  const series = [...new Set(seriesTags)].map((tag) => ({
    tag,
    label: TAG_LABELS[tag],
    points: currentDays.map((date) => ({ date, value: valueOn(tag, date) })),
  }));

  return { window, metric, series, movers };
}
