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
}

export interface RankPlan {
  items: { id: string; engagement: number; percentile: number }[];
  stories: { id: string; engagementPercentile: number; rankScore: number }[];
}

/** Scores every Story from its items; `populationItems` are the items published in the trailing window, whose engagements form each kind's percentile sample. */
export function planRankUpdates(input: {
  stories: readonly RankStory[];
  populationItems: readonly RankItem[];
  now: Date;
}): RankPlan {
  const engagementsByKind = new Map<SourceKind, number[]>();
  for (const item of input.populationItems) {
    const engagements = engagementsByKind.get(item.kind) ?? [];
    engagements.push(itemEngagement(item));
    engagementsByKind.set(item.kind, engagements);
  }

  const plan: RankPlan = { items: [], stories: [] };
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
        sourceKinds: story.items.map((item) => item.kind),
      }),
    });
  }
  return plan;
}
