const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const UNITS = [
  { size: DAY, short: 'd', long: 'day' },
  { size: HOUR, short: 'h', long: 'h' },
  { size: MINUTE, short: 'm', long: 'min' },
];

/** Formats how long before `now` an instant was: `3h` in the short style, `14 min ago` in the long one. */
export function formatRelativeTime(iso: string, now: Date, style: 'short' | 'long' = 'short') {
  const elapsed = Math.max(0, now.getTime() - new Date(iso).getTime());
  const unit = UNITS.find(({ size }) => elapsed >= size);
  if (!unit) return style === 'short' ? 'now' : 'just now';
  const count = Math.floor(elapsed / unit.size);
  if (style === 'short') return `${count}${unit.short}`;
  const plural = unit.long === 'day' && count !== 1 ? 's' : '';
  return `${count} ${unit.long}${plural} ago`;
}
