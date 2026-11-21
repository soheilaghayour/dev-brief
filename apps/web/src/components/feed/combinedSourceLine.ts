import type { SourceKind, SourceRef } from '@devbrief/shared';
import { formatCompactCount } from '@/lib/format/formatCompactCount';
import { SOURCE_KIND_ORDER } from './sourceKinds';

export type SourceLineSegment = {
  kind: SourceKind;
  /** What goes before the segment: the line's lead-in, "&" between trending sources, "·" otherwise. */
  joiner: string;
  text: string;
};

const IS_TRENDING = { hn: true, devto: true, rss: false, github: false } satisfies Record<
  SourceKind,
  boolean
>;

function highest(sources: SourceRef[], pick: (source: SourceRef) => number | null) {
  const values = sources.flatMap((source) => pick(source) ?? []);
  return values.length > 0 ? Math.max(...values) : null;
}

function withCount(name: string, glyph: string, count: number | null) {
  return count === null ? name : `${name} (${glyph} ${count})`;
}

const SEGMENT_TEXT = {
  hn: (sources) =>
    withCount(
      'HN',
      '▲',
      highest(sources, (source) => source.points),
    ),
  devto: (sources) =>
    withCount(
      'Dev.to',
      '♥',
      highest(sources, (source) => source.reactions),
    ),
  rss: (sources) => `${sources.length} ${sources.length === 1 ? 'blog' : 'blogs'}`,
  github: (sources) => {
    const stars = highest(sources, (source) => source.stars);
    return stars === null ? 'GitHub' : `GitHub (★ ${formatCompactCount(stars)})`;
  },
} satisfies Record<SourceKind, (sources: SourceRef[]) => string>;

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
    text: SEGMENT_TEXT[kind](sources.filter((source) => source.kind === kind)),
  }));
}
