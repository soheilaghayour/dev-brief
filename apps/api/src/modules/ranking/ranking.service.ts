import { Injectable, type OnModuleInit } from '@nestjs/common';
import { topWindowStart } from '@devbrief/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { IngestionPostRunSteps, type IngestionPostRunStep } from '../ingestion/postRunStep.js';
import { planRankUpdates, type RankItem, type RankPlan } from './rankPlan.js';

const WRITE_BATCH_SIZE = 500;

const itemWithSource = { source: { select: { kind: true, baselinePercentile: true } } };
type LoadedItem = Prisma.SourceItemGetPayload<{ include: typeof itemWithSource }>;

function toRankItem(item: LoadedItem): RankItem {
  return {
    id: item.id,
    kind: item.source.kind,
    baselinePercentile: item.source.baselinePercentile,
    points: item.points,
    commentsCount: item.commentsCount,
    reactionsCount: item.reactionsCount,
    stars: item.stars,
  };
}

type ClusterState = {
  id: string;
  representativeStoryId: string;
  rankScore: number;
  stories: { id: string; isPrimary: boolean }[];
};

/** Recomputes engagement, percentiles and rank scores of recent Stories after each ingestion run. */
@Injectable()
export class RankingService implements IngestionPostRunStep, OnModuleInit {
  readonly name = 'rank-recompute';

  constructor(
    private readonly prisma: PrismaService,
    private readonly postRunSteps: IngestionPostRunSteps,
  ) {}

  onModuleInit() {
    this.postRunSteps.register(this);
  }

  async run({ now }: { now: Date }) {
    await this.recompute(now);
  }

  /** Scores the Stories published in the Top window; older Stories keep their last score. */
  async recompute(now: Date) {
    const since = topWindowStart(now);
    const windowStories = await this.prisma.story.findMany({
      where: { publishedAt: { gte: since } },
      select: {
        id: true,
        publishedAt: true,
        engagementPercentile: true,
        rankScore: true,
        rankedAt: true,
        clusterId: true,
        items: { include: itemWithSource },
      },
    });
    const windowIds = new Set(windowStories.map((story) => story.id));
    const clusters = await this.prisma.cluster.findMany({
      where: { id: { in: [...new Set(windowStories.flatMap((s) => s.clusterId ?? []))] } },
      select: {
        id: true,
        sourceKinds: true,
        representativeStoryId: true,
        rankScore: true,
        stories: { select: { id: true, rankScore: true, isPrimary: true } },
      },
    });
    const populationItems = await this.prisma.sourceItem.findMany({
      where: { publishedAt: { gte: since } },
      include: itemWithSource,
    });

    const plan = planRankUpdates({
      stories: windowStories.map((story) => ({ ...story, items: story.items.map(toRankItem) })),
      populationItems: populationItems.map(toRankItem),
      clusters,
      outsideMembers: clusters.flatMap((cluster) =>
        cluster.stories
          .filter((member) => !windowIds.has(member.id))
          .map((member) => ({ id: member.id, clusterId: cluster.id, rankScore: member.rankScore })),
      ),
      now,
    });

    const currentItems = new Map(
      windowStories.flatMap((story) => story.items).map((item) => [item.id, item]),
    );
    const currentStories = new Map(windowStories.map((story) => [story.id, story]));
    const updates: Prisma.PrismaPromise<unknown>[] = [
      ...plan.items
        .filter(({ id, engagement, percentile }) => {
          const current = currentItems.get(id);
          return current?.engagement !== engagement || current.percentile !== percentile;
        })
        .map(({ id, engagement, percentile }) =>
          this.prisma.sourceItem.update({ where: { id }, data: { engagement, percentile } }),
        ),
      ...plan.stories
        .filter(({ id, engagementPercentile, rankScore }) => {
          const current = currentStories.get(id);
          return (
            current?.rankedAt === null ||
            current?.engagementPercentile !== engagementPercentile ||
            current.rankScore !== rankScore
          );
        })
        .map(({ id, ...scores }) =>
          this.prisma.story.update({ where: { id }, data: { ...scores, rankedAt: now } }),
        ),
    ];
    updates.push(...this.clusterUpdates(plan, clusters));
    for (let start = 0; start < updates.length; start += WRITE_BATCH_SIZE) {
      await this.prisma.$transaction(updates.slice(start, start + WRITE_BATCH_SIZE));
    }
  }

  /** Writes each touched cluster's representative and rank, and leaves exactly that member primary. */
  private clusterUpdates(plan: RankPlan, clusters: readonly ClusterState[]) {
    const clusterById = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    return plan.clusters.flatMap((picked) => {
      const cluster = clusterById.get(picked.id);
      if (!cluster) return [];
      const stale =
        cluster.representativeStoryId !== picked.representativeStoryId ||
        cluster.rankScore !== picked.rankScore;
      return [
        ...(stale
          ? [
              this.prisma.cluster.update({
                where: { id: picked.id },
                data: {
                  representativeStoryId: picked.representativeStoryId,
                  rankScore: picked.rankScore,
                },
              }),
            ]
          : []),
        ...cluster.stories
          .filter((member) => member.isPrimary !== (member.id === picked.representativeStoryId))
          .map((member) =>
            this.prisma.story.update({
              where: { id: member.id },
              data: { isPrimary: member.id === picked.representativeStoryId },
            }),
          ),
      ];
    });
  }
}
