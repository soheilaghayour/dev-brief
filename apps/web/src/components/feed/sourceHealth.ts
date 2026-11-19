import type { SourceKind, SourceList, SourceStatus } from '@devbrief/shared';

type SourceEntry = SourceList['sources'][number];

export type KindHealth = { status: SourceStatus; lastSuccessAt: string | null };

const SEVERITY = {
  healthy: 0,
  stale: 1,
  circuit_open: 2,
} satisfies Record<SourceStatus, number>;

/** The health of a source kind: the worst status among its sources, and their latest success. */
export function kindHealth(sources: readonly SourceEntry[], kind: SourceKind): KindHealth | null {
  const members = sources.filter((source) => source.kind === kind);
  if (members.length === 0) return null;
  const status = members.reduce<SourceStatus>(
    (worst, { status: next }) => (SEVERITY[next] > SEVERITY[worst] ? next : worst),
    'healthy',
  );
  const successes = members.flatMap(({ lastSuccessAt }) => (lastSuccessAt ? [lastSuccessAt] : []));
  return { status, lastSuccessAt: successes.sort().at(-1) ?? null };
}

/** Sources that are not healthy, for the one-line summary under the filters. */
export function countUnhealthy(sources: readonly SourceEntry[]) {
  return sources.filter(({ status }) => status !== 'healthy').length;
}
