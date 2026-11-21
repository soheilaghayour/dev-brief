import { Injectable, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { IngestionPostRunSteps, type IngestionPostRunStep } from '../ingestion/postRunStep.js';
import { aggregateTagStats, yesterdayStart } from './dailyRules.js';

/**
 * Recomputes `TagDailyStat`. The daily job rolls up three days at 03:15 UTC; this post-run step
 * rolls up yesterday and today after each ingestion run, so the radar's last full day is complete
 * soon after midnight instead of at 03:15.
 */
@Injectable()
export class TagStatsService implements IngestionPostRunStep, OnModuleInit {
  readonly name = 'tag-stats';

  constructor(
    private readonly prisma: PrismaService,
    private readonly postRunSteps: IngestionPostRunSteps,
  ) {}

  onModuleInit() {
    this.postRunSteps.register(this);
  }

  async run({ now }: { now: Date }) {
    await this.recompute(yesterdayStart(now), now);
  }

  /** Replaces every row from `windowStart` (a UTC midnight) on with the stories published up to `now`. */
  async recompute(windowStart: Date, now: Date) {
    const stories = await this.prisma.story.findMany({
      where: { publishedAt: { gte: windowStart, lte: now } },
      select: {
        publishedAt: true,
        tags: true,
        engagementPercentile: true,
        items: { select: { engagement: true } },
      },
    });
    const rows = aggregateTagStats(
      stories.map(({ items, ...story }) => ({
        ...story,
        itemEngagements: items.map((item) => item.engagement),
      })),
    );
    // Replaced, not upserted: a (day, tag) whose stories moved day or lost the tag must disappear.
    await this.prisma.$transaction([
      this.prisma.tagDailyStat.deleteMany({ where: { day: { gte: windowStart } } }),
      this.prisma.tagDailyStat.createMany({ data: rows }),
    ]);
  }
}
