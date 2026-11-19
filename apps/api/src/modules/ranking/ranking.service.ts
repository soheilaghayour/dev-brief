import { Injectable, type OnModuleInit } from '@nestjs/common';
import { TOP_WINDOW_DAYS } from '@devbrief/shared';
import { LruCache } from '../../common/cache/lru.cache.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { IngestionPostRunSteps, type IngestionPostRunStep } from '../ingestion/postRunStep.js';
import { planRankUpdates, type RankItem } from './rankPlan.js';

const MS_PER_DAY = 86_400_000;
const WRITE_BATCH_SIZE = 500;

type LoadedItem = Prisma.SourceItemGetPayload<{ include: { source: true } }>;

function toRankItem(item: LoadedItem): RankItem {
  return {
    id: item.id,
    kind: item.source.kind,
    baselinePercentile: item.source.baselinePercentile,
    publishedAt: item.publishedAt,
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
    await this.recompute(now);
    this.cache.clear();
  }

  /** Scores the Stories published in the last TOP_WINDOW_DAYS; older Stories keep their last score. */
  async recompute(now: Date) {
    const since = new Date(now.getTime() - TOP_WINDOW_DAYS * MS_PER_DAY);
    const windowStories = await this.prisma.story.findMany({
      where: { publishedAt: { gte: since } },
      select: { id: true, publishedAt: true, items: { include: { source: true } } },
    });
    const populationItems = await this.prisma.sourceItem.findMany({
      where: { publishedAt: { gte: since } },
      include: { source: true },
    });

    const plan = planRankUpdates({
      stories: windowStories.map((story) => ({ ...story, items: story.items.map(toRankItem) })),
      populationItems: populationItems.map(toRankItem),
      now,
    });

    const updates = [
      ...plan.items.map(({ id, engagement, percentile }) =>
        this.prisma.sourceItem.update({ where: { id }, data: { engagement, percentile } }),
      ),
      ...plan.stories.map(({ id, ...scores }) =>
        this.prisma.story.update({ where: { id }, data: { ...scores, rankedAt: now } }),
      ),
    ];
    for (let start = 0; start < updates.length; start += WRITE_BATCH_SIZE) {
      await this.prisma.$transaction(updates.slice(start, start + WRITE_BATCH_SIZE));
    }
  }
}
