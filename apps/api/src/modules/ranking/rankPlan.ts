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

/** A cluster member published before the window: it keeps its stored score but still competes to be the representative. */
export interface RankedClusterMember {
  id: string;
  clusterId: string;
  rankScore: number;
}

export interface RankPlan {
  items: { id: string; engagement: number; percentile: number }[];
  stories: { id: string; engagementPercentile: number; rankScore: number }[];
  /** One entry per cluster with a member in the window. */
  clusters: { id: string; representativeStoryId: string; rankScore: number }[];
}

/**
 * Scores every Story from its items, counting a clustered story's source kinds over its whole cluster, then picks each
 * touched cluster's representative: the member with the highest score, ties by id desc. `populationItems` are the items
 * published in the trailing window, whose engagements form each kind's percentile sample.
 */
export function planRankUpdates(input: {
  stories: readonly RankStory[];
  populationItems: readonly RankItem[];
  clusters?: readonly { id: string; sourceKinds: readonly SourceKind[] }[];
  outsideMembers?: readonly RankedClusterMember[];
  now: Date;
}): RankPlan {
  const clusterKinds = new Map(
    (input.clusters ?? []).map((cluster) => [cluster.id, cluster.sourceKinds]),
  );
  const engagementsByKind = new Map<SourceKind, number[]>();
  for (const item of input.populationItems) {
    const engagements = engagementsByKind.get(item.kind) ?? [];
    engagements.push(itemEngagement(item));
    engagementsByKind.set(item.kind, engagements);
  }

  const clusterIdByStory = new Map(
    input.stories.flatMap((story) => (story.clusterId ? [[story.id, story.clusterId]] : [])),
  );
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
    plan.stories.push({
      id: story.id,
      engagementPercentile,
      rankScore: rankScore({
        percentile: engagementPercentile,
        publishedAt: story.publishedAt,
        now: input.now,
        sourceKinds:
          (story.clusterId && clusterKinds.get(story.clusterId)) ||
          story.items.map((item) => item.kind),
      }),
    });
  }
  plan.clusters = pickRepresentatives([
    ...plan.stories.flatMap(({ id, rankScore }) => {
      const clusterId = clusterIdByStory.get(id);
      return clusterId ? [{ id, clusterId, rankScore }] : [];
    }),
    ...(input.outsideMembers ?? []),
  ]);
  return plan;
}

function pickRepresentatives(members: readonly RankedClusterMember[]) {
  const best = new Map<string, RankedClusterMember>();
  for (const member of members) {
    const current = best.get(member.clusterId);
    if (
      !current ||
      member.rankScore > current.rankScore ||
      (member.rankScore === current.rankScore && member.id > current.id)
    ) {
      best.set(member.clusterId, member);
    }
  }
  return [...best].map(([id, { id: representativeStoryId, rankScore }]) => ({
    id,
    representativeStoryId,
    rankScore,
  }));
}
