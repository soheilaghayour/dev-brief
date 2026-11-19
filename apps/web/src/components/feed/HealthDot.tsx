import type { SourceStatus } from '@devbrief/shared';
import { cn } from '@/lib/cn';

const DOT_STYLES = {
  healthy: 'bg-success',
  stale: 'bg-warning',
  circuit_open: 'bg-destructive',
} satisfies Record<SourceStatus, string>;

const STATUS_LABELS = {
  healthy: 'Healthy',
  stale: 'Stale',
  circuit_open: 'Unavailable',
} satisfies Record<SourceStatus, string>;

type HealthDotProps = { status: SourceStatus; tooltip: string };

/** A coloured dot with its meaning in text, so colour is never the only signal. */
export function HealthDot({ status, tooltip }: HealthDotProps) {
  return (
    <span title={tooltip} data-status={status} className="inline-flex items-center">
      <span className={cn('size-2 rounded-full', DOT_STYLES[status])} aria-hidden="true" />
      <span className="sr-only">
        {STATUS_LABELS[status]}. {tooltip}
      </span>
    </span>
  );
}
