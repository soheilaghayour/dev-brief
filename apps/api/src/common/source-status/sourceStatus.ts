import type { SourceStatus } from '@devbrief/shared';

export const SOURCE_STALE_AFTER_HOURS = 2;

type SourceHealthFields = { circuitOpenUntil: Date | null; lastSuccessAt: Date | null };

/** Classifies one source: an open circuit wins, then a success within the stale window, else stale. */
export function sourceStatus(source: SourceHealthFields, now: Date): SourceStatus {
  if (source.circuitOpenUntil && source.circuitOpenUntil > now) return 'circuit_open';
  const staleBefore = now.getTime() - SOURCE_STALE_AFTER_HOURS * 3_600_000;
  if (source.lastSuccessAt && source.lastSuccessAt.getTime() >= staleBefore) return 'healthy';
  return 'stale';
}

/** The overall health status: degraded as soon as one source is not healthy. */
export function overallStatus(statuses: readonly SourceStatus[]) {
  return statuses.every((status) => status === 'healthy') ? 'ok' : 'degraded';
}
