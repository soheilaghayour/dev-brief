import {
  SOURCE_KINDS,
  type SourceKind,
  type SourceList,
  type SourceStatus,
} from '@devbrief/shared';

type SourceEntry = SourceList['sources'][number];

export type KindHealth = { status: SourceStatus; lastSuccessAt: string | null };

const SEVERITY = {
  healthy: 0,
  stale: 1,
  circuit_open: 2,
} satisfies Record<SourceStatus, number>;

/** The health of a source kind: the worst status among its sources, and their latest success. */
function kindHealth(sources: readonly SourceEntry[], kind: SourceKind): KindHealth | null {
  const members = sources.filter((source) => source.kind === kind);
  if (members.length === 0) return null;
  const status = members.reduce<SourceStatus>(
    (worst, { status: next }) => (SEVERITY[next] > SEVERITY[worst] ? next : worst),
    'healthy',
  );
  const successes = members.flatMap(({ lastSuccessAt }) => (lastSuccessAt ? [lastSuccessAt] : []));
  return { status, lastSuccessAt: successes.sort().at(-1) ?? null };
}

/** Each kind `/sources` lists, in filter order, with its health; a kind without sources is left out. */
export function listedKinds(sources: readonly SourceEntry[]) {
  return SOURCE_KINDS.flatMap((kind) => {
    const health = kindHealth(sources, kind);
    return health ? [{ kind, health }] : [];
  });
}

/** Sources that are not healthy, for the one-line summary under the filters. */
export function countUnhealthy(sources: readonly SourceEntry[]) {
  return sources.filter(({ status }) => status !== 'healthy').length;
}
