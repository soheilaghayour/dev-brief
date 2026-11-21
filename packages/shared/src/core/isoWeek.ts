const DAY_MS = 86_400_000;
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;

/** The Monday 00:00 UTC that starts ISO week 1 of the year: the week holding January 4th. */
function firstWeekStart(year: number) {
  const weekday = new Date(Date.UTC(year, 0, 4)).getUTCDay() || 7;
  return Date.UTC(year, 0, 4 - (weekday - 1));
}

/** The ISO week of the instant in UTC, as `2026-W47`; a week that spans New Year belongs to the year holding its Thursday. */
export function isoWeekOf(date: Date) {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const thursday = new Date(day + (4 - (new Date(day).getUTCDay() || 7)) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - firstWeekStart(year)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday 00:00 UTC (inclusive) to the next Monday (exclusive) of a week like `2026-W47`; throws on a week that doesn't exist. */
export function isoWeekRange(week: string) {
  const match = WEEK_PATTERN.exec(week);
  if (!match) throw new RangeError(`Not an ISO week: ${week}`);
  const start = new Date(firstWeekStart(Number(match[1])) + (Number(match[2]) - 1) * 7 * DAY_MS);
  // Week 53 of a 52-week year, or week 00, lands in a neighbouring week.
  if (isoWeekOf(start) !== week) throw new RangeError(`Not an ISO week: ${week}`);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** The week of `now` and the ones before it, newest first. */
export function recentIsoWeeks(now: Date, count: number) {
  return Array.from({ length: count }, (_, back) =>
    isoWeekOf(new Date(now.getTime() - back * 7 * DAY_MS)),
  );
}
