const MS_PER_DAY = 86_400_000;

/** Days since the epoch of `now`'s UTC day, which keys the ledger's per-day lock. */
export function utcDayNumber(now: Date) {
  return Math.floor(now.getTime() / MS_PER_DAY);
}

/** Midnight UTC of `now`'s UTC day, the day bucket of every per-day counter and ledger row. */
export function utcDay(now: Date) {
  return new Date(utcDayNumber(now) * MS_PER_DAY);
}
