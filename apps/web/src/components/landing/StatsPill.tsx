'use client';

import { useEffect, useState } from 'react';
import type { Stats } from '@devbrief/shared';
import { formatRelativeTime } from '@/lib/format/formatRelativeTime';
import { formatCounts } from './landingStories';

type StatsPillProps = { stats: Stats | null; renderedAt: string };

function freshness(lastIngestedAt: string | null, now: Date) {
  return lastIngestedAt ? `Updated ${formatRelativeTime(lastIngestedAt, now, 'long')}` : null;
}

/** The hero eyebrow: how fresh the feed is and how much it holds. */
export function StatsPill({ stats, renderedAt }: StatsPillProps) {
  // The page is generated up to 15 min before it is read, so the age is recomputed in the browser.
  const [now, setNow] = useState(() => new Date(renderedAt));
  useEffect(() => setNow(new Date()), []);

  const parts = [
    stats && freshness(stats.lastIngestedAt, now),
    stats && formatCounts(stats.storiesToday, stats.sourceCount),
  ].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <p className="bg-card/60 text-muted-foreground mx-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
      <span className="relative flex size-2" aria-hidden="true">
        <span className="bg-success absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping" />
        <span className="bg-success relative inline-flex size-2 rounded-full" />
      </span>
      <span suppressHydrationWarning>{parts.join(' · ')}</span>
    </p>
  );
}
