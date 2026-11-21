import type { SourceKind, SourceRef } from '@devbrief/shared';
import { formatCompactCount } from '@/lib/format/formatCompactCount';
import { SOURCE_KIND_ORDER } from './sourceKinds';

export type SourceLineSegment = {
  kind: SourceKind;
  /** What goes before the segment: the line's lead-in, "&" between trending sources, "·" otherwise. */
  joiner: string;
  name: string;
  /** The score with its glyph, absent when the source has none or the name already carries the count (blogs). */
  metric: { glyph: string; value: string; label: string } | null;
};

const IS_TRENDING = { hn: true, devto: true, rss: false, github: false } satisfies Record<
  SourceKind,
  boolean
>;

function highest(sources: SourceRef[], pick: (source: SourceRef) => number | null) {
  const values = sources.flatMap((source) => pick(source) ?? []);
  return values.length > 0 ? Math.max(...values) : null;
}

function scoreMetric(glyph: string, count: number | null, label: string) {
  return count === null ? null : { glyph, value: String(count), label };
}

const SEGMENT = {
  hn: (sources) => ({
    name: 'HN',
    metric: scoreMetric(
      '▲',
      highest(sources, (source) => source.points),
      'points',
    ),
  }),
  devto: (sources) => ({
    name: 'Dev.to',
    metric: scoreMetric(
      '♥',
      highest(sources, (source) => source.reactions),
      'reactions',
    ),
  }),
  rss: (sources) => ({
    name: `${sources.length} ${sources.length === 1 ? 'blog' : 'blogs'}`,
    metric: null,
  }),
  github: (sources) => {
    const stars = highest(sources, (source) => source.stars);
    return {
      name: 'GitHub',
      metric:
        stars === null ? null : { glyph: '★', value: formatCompactCount(stars), label: 'stars' },
    };
  },
} satisfies Record<
  SourceKind,
  (sources: SourceRef[]) => Pick<SourceLineSegment, 'name' | 'metric'>
>;

function joinerBefore(kind: SourceKind, previous: SourceKind | undefined) {
  if (previous === undefined) return IS_TRENDING[kind] ? 'Trending on ' : '';
  return IS_TRENDING[kind] && IS_TRENDING[previous] ? ' & ' : ' · ';
}

/** The cluster card's source line, e.g. "Trending on HN (▲ 320) & Dev.to (♥ 95) · 2 blogs": one segment per source kind present, in a fixed order. */
export function combinedSourceLine(sources: SourceRef[]): SourceLineSegment[] {
  const present = SOURCE_KIND_ORDER.filter((kind) =>
    sources.some((source) => source.kind === kind),
  );
  return present.map((kind, index) => ({
    kind,
    joiner: joinerBefore(kind, present[index - 1]),
    ...SEGMENT[kind](sources.filter((source) => source.kind === kind)),
  }));
}
