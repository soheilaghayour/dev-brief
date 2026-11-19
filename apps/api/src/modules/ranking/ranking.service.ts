import { Injectable, type OnModuleInit } from '@nestjs/common';
import { topWindowStart } from '@devbrief/shared';
import { LruCache } from '../../common/cache/lru.cache.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { IngestionPostRunSteps, type IngestionPostRunStep } from '../ingestion/postRunStep.js';
import { planRankUpdates, type RankItem } from './rankPlan.js';

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
    private readonly cache: LruCache,
    private readonly postRunSteps: IngestionPostRunSteps,
  ) {}

  onModuleInit() {
    this.postRunSteps.register(this);
  }

  async run({ now }: { now: Date }) {
    try {
      await this.recompute(now);
    } finally {
      // Batches commit one by one, so a partial failure still changed scores readers may cache.
      this.cache.clear();
    }
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
        items: { include: itemWithSource },
      },
    });
    const populationItems = await this.prisma.sourceItem.findMany({
      where: { publishedAt: { gte: since } },
      include: itemWithSource,
    });

    const plan = planRankUpdates({
      stories: windowStories.map((story) => ({ ...story, items: story.items.map(toRankItem) })),
      populationItems: populationItems.map(toRankItem),
      now,
    });

    const currentItems = new Map(
      windowStories.flatMap((story) => story.items).map((item) => [item.id, item]),
    );
    const currentStories = new Map(windowStories.map((story) => [story.id, story]));
    const updates = [
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
    for (let start = 0; start < updates.length; start += WRITE_BATCH_SIZE) {
      await this.prisma.$transaction(updates.slice(start, start + WRITE_BATCH_SIZE));
    }
  }
}
