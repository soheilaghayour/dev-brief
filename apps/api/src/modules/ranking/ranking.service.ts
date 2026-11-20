import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { topWindowStart } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { IngestionPostRunSteps, type IngestionPostRunStep } from '../ingestion/postRunStep.js';
import { planRankUpdates, type ClusterPlan, type RankItem } from './rankPlan.js';

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

/** Recomputes engagement, percentiles and rank scores of recent Stories after each ingestion run. */
@Injectable()
export class RankingService implements IngestionPostRunStep, OnModuleInit {
  readonly name = 'rank-recompute';

  constructor(
    private readonly prisma: PrismaService,
    private readonly postRunSteps: IngestionPostRunSteps,
    @Inject(ENV) private readonly env: Env,
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
    // With the clusters flag off every story scores as in Phase 1, even if Cluster rows exist.
    const clusters = this.env.FEATURE_CLUSTERS
      ? await this.loadClusters(windowStories.flatMap((story) => story.clusterId ?? []))
      : [];
    const populationItems = await this.prisma.sourceItem.findMany({
      where: { publishedAt: { gte: since } },
      include: itemWithSource,
    });

    const plan = planRankUpdates({
      stories: windowStories.map((story) => ({ ...story, items: story.items.map(toRankItem) })),
      populationItems: populationItems.map(toRankItem),
      clusters,
      now,
    });

    const currentItems = new Map(
      windowStories.flatMap((story) => story.items).map((item) => [item.id, item]),
    );
    const currentStories = new Map(windowStories.map((story) => [story.id, story]));
    // Each group lands in one transaction batch, so a cluster's flips and representative are never split.
    const groups: Prisma.PrismaPromise<unknown>[][] = [
      ...plan.items
        .filter(({ id, engagement, percentile }) => {
          const current = currentItems.get(id);
          return current?.engagement !== engagement || current.percentile !== percentile;
        })
        .map(({ id, engagement, percentile }) => [
          this.prisma.sourceItem.update({ where: { id }, data: { engagement, percentile } }),
        ]),
      ...plan.stories
        .filter(({ id, engagementPercentile, rankScore }) => {
          const current = currentStories.get(id);
          return (
            current?.rankedAt === null ||
            current?.engagementPercentile !== engagementPercentile ||
            current.rankScore !== rankScore
          );
        })
        .map(({ id, ...scores }) => [
          this.prisma.story.update({ where: { id }, data: { ...scores, rankedAt: now } }),
        ]),
      ...plan.clusters.map((cluster) => this.clusterWrites(cluster)),
    ].filter((group) => group.length > 0);
    let batch: Prisma.PrismaPromise<unknown>[] = [];
    for (const group of groups) {
      if (batch.length > 0 && batch.length + group.length > WRITE_BATCH_SIZE) {
        await this.prisma.$transaction(batch);
        batch = [];
      }
      batch.push(...group);
    }
    if (batch.length > 0) await this.prisma.$transaction(batch);
  }

  private async loadClusters(ids: string[]) {
    const rows = await this.prisma.cluster.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: {
        id: true,
        sourceKinds: true,
        representativeStoryId: true,
        rankScore: true,
        stories: {
          select: {
            id: true,
            isPrimary: true,
            items: { select: { source: { select: { kind: true } } } },
          },
        },
      },
    });
    return rows.map(({ stories, ...cluster }) => ({
      ...cluster,
      members: stories.map((member) => ({
        id: member.id,
        isPrimary: member.isPrimary,
        kinds: member.items.map((item) => item.source.kind),
      })),
    }));
  }

  /** The writes one planned cluster needs: its row if stale, and the members whose `isPrimary` flips. */
  private clusterWrites({ id, flips, stale, ...picked }: ClusterPlan) {
    return [
      ...(stale
        ? [
            this.prisma.cluster.update({
              where: { id },
              data: {
                representativeStoryId: picked.representativeStoryId,
                rankScore: picked.rankScore,
                sourceKinds: picked.sourceKinds,
              },
            }),
          ]
        : []),
      ...flips.map((flip) =>
        this.prisma.story.update({ where: { id: flip.id }, data: { isPrimary: flip.isPrimary } }),
      ),
    ];
  }
}
