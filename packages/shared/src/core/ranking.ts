export const SOURCE_KINDS = ['hn', 'devto', 'rss', 'github'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const RANK_GRAVITY = 1.5;
export const RSS_BASELINE = 0.6;
export const MULTI_SOURCE_BONUS = 0.15;
export const TOP_WINDOW_DAYS = 7;
export const MIN_SAMPLE = 10;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** The oldest `publishedAt` the Top sort shows; the rank recompute scores the same window. */
export function topWindowStart(now: Date) {
  return new Date(now.getTime() - TOP_WINDOW_DAYS * MS_PER_DAY);
}

interface ItemCounts {
  kind: SourceKind;
  points?: number | null;
  commentsCount?: number | null;
  reactionsCount?: number | null;
  stars?: number | null;
}

/** Engagement of one SourceItem by its source kind; RSS has none and counts as 0. */
export function itemEngagement(item: ItemCounts) {
  switch (item.kind) {
    case 'hn':
      return item.points ?? 0;
    case 'devto':
      return (item.reactionsCount ?? 0) + (item.commentsCount ?? 0);
    case 'github':
      return item.stars ?? 0;
    case 'rss':
      return 0;
  }
}

/** Mid-rank percentile of `engagement` among the same source kind's 7-day engagements (the item itself included). */
export function percentile(engagement: number, sameKindEngagements: readonly number[]) {
  const n = sameKindEngagements.length;
  if (n < MIN_SAMPLE) return 0.5;

  let countBelow = 0;
  let countEqual = 0;
  for (const other of sameKindEngagements) {
    if (other < engagement) countBelow++;
    else if (other === engagement) countEqual++;
  }
  return (countBelow + 0.5 * countEqual) / n;
}

interface ItemPercentileInput {
  kind: SourceKind;
  engagement: number;
  sameKindEngagements: readonly number[];
  baselinePercentile?: number | null;
}

/** Percentile of one SourceItem; RSS items use the source's fixed baseline instead of their engagement. */
export function itemPercentile(input: ItemPercentileInput) {
  if (input.kind === 'rss') return input.baselinePercentile ?? RSS_BASELINE;
  return percentile(input.engagement, input.sameKindEngagements);
}

/** A Story is as engaging as its most engaging SourceItem. */
export function storyPercentile(itemPercentiles: readonly number[]) {
  return itemPercentiles.length === 0 ? 0 : Math.max(...itemPercentiles);
}

interface RankScoreInput {
  percentile: number;
  publishedAt: Date;
  now: Date;
  sourceKinds: readonly SourceKind[];
}

/** HN-style age-decayed score of a Story, boosted for each additional distinct source kind. */
export function rankScore(input: RankScoreInput) {
  const ageHours = Math.max(0, (input.now.getTime() - input.publishedAt.getTime()) / MS_PER_HOUR);
  const base = 1 + 99 * input.percentile;
  const score = base / (ageHours + 2) ** RANK_GRAVITY;
  const distinctKinds = Math.max(1, new Set(input.sourceKinds).size);
  return score * (1 + MULTI_SOURCE_BONUS * (distinctKinds - 1));
}
