import {
  itemEngagement,
  itemPercentile,
  rankScore,
  storyPercentile,
  type SourceKind,
} from '@devbrief/shared';

export interface RankItem {
  id: string;
  kind: SourceKind;
  baselinePercentile: number | null;
  points: number | null;
  commentsCount: number | null;
  reactionsCount: number | null;
  stars: number | null;
}

export interface RankStory {
  id: string;
  publishedAt: Date;
  items: readonly RankItem[];
  clusterId: string | null;
}

/** A cluster as stored, with every member (in the window or not). */
export interface RankCluster {
  id: string;
  sourceKinds: readonly SourceKind[];
  representativeStoryId: string;
  rankScore: number;
  members: readonly { id: string; isPrimary: boolean; kinds: readonly SourceKind[] }[];
}

export interface ClusterPlan {
  id: string;
  representativeStoryId: string;
  rankScore: number;
  /** Union of the members' source kinds, sorted. */
  sourceKinds: SourceKind[];
  /** Whether the Cluster row itself differs from the stored one. */
  stale: boolean;
  /** The members whose `isPrimary` must change. */
  flips: { id: string; isPrimary: boolean }[];
}

export interface RankPlan {
  items: { id: string; engagement: number; percentile: number }[];
  stories: { id: string; engagementPercentile: number; rankScore: number }[];
  /** One entry per cluster with a member in the window. */
  clusters: ClusterPlan[];
}

/** The member with the highest score, ties by id desc. */
export function pickBest<T extends { id: string; rankScore: number }>(members: readonly T[]) {
  return members.reduce<T | undefined>(
    (best, member) =>
      !best ||
      member.rankScore > best.rankScore ||
      (member.rankScore === best.rankScore && member.id > best.id)
        ? member
        : best,
    undefined,
  );
}

/** Scores every Story (`k` counted over its whole cluster), then picks each touched cluster's representative from its in-window members. */
export function planRankUpdates(input: {
  stories: readonly RankStory[];
  populationItems: readonly RankItem[];
  clusters?: readonly RankCluster[];
  now: Date;
}): RankPlan {
  const clusters = input.clusters ?? [];
  const clusterKinds = new Map(
    clusters.map((cluster) => [
      cluster.id,
      [...new Set(cluster.members.flatMap((member) => member.kinds))].sort(),
    ]),
  );
  const engagementsByKind = new Map<SourceKind, number[]>();
  for (const item of input.populationItems) {
    const engagements = engagementsByKind.get(item.kind) ?? [];
    engagements.push(itemEngagement(item));
    engagementsByKind.set(item.kind, engagements);
  }

  const scoredMembers = new Map<string, { id: string; rankScore: number }[]>();
  const plan: RankPlan = { items: [], stories: [], clusters: [] };
  for (const story of input.stories) {
    const itemPercentiles: number[] = [];
    for (const item of story.items) {
      const engagement = itemEngagement(item);
      const percentile = itemPercentile({
        kind: item.kind,
        engagement,
        sameKindEngagements: engagementsByKind.get(item.kind) ?? [],
        baselinePercentile: item.baselinePercentile,
      });
      plan.items.push({ id: item.id, engagement, percentile });
      itemPercentiles.push(percentile);
    }
    const engagementPercentile = storyPercentile(itemPercentiles);
    const kinds = (story.clusterId && clusterKinds.get(story.clusterId)) || undefined;
    const score = rankScore({
      percentile: engagementPercentile,
      publishedAt: story.publishedAt,
      now: input.now,
      sourceKinds: kinds ?? story.items.map((item) => item.kind),
    });
    plan.stories.push({ id: story.id, engagementPercentile, rankScore: score });
    if (story.clusterId && kinds) {
      const members = scoredMembers.get(story.clusterId) ?? [];
      members.push({ id: story.id, rankScore: score });
      scoredMembers.set(story.clusterId, members);
    }
  }
  plan.clusters = clusters.flatMap((cluster) => {
    const best = pickBest(scoredMembers.get(cluster.id) ?? []);
    if (!best) return [];
    const sourceKinds = clusterKinds.get(cluster.id) ?? [];
    return {
      id: cluster.id,
      representativeStoryId: best.id,
      rankScore: best.rankScore,
      sourceKinds,
      stale:
        cluster.representativeStoryId !== best.id ||
        cluster.rankScore !== best.rankScore ||
        cluster.sourceKinds.length !== sourceKinds.length ||
        [...cluster.sourceKinds].sort().some((kind, index) => kind !== sourceKinds[index]),
      flips: cluster.members
        .filter((member) => member.isPrimary !== (member.id === best.id))
        .map((member) => ({ id: member.id, isPrimary: member.id === best.id })),
    };
  });
  return plan;
}
