import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  aggregateTagStats,
  ingestionRunCutoff,
  PURGE_BATCH_SIZE,
  storyCutoff,
  tagStatWindowStart,
} from './dailyRules.js';

/** The daily job: tag rollup first, then retention. */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('15 3 * * *', { timeZone: 'UTC' })
  async runScheduled() {
    try {
      await this.runDaily(new Date());
    } catch (error) {
      this.logger.error(`Daily job failed: ${String(error)}`);
    }
  }

  async runDaily(now: Date) {
    await this.upsertTagDailyStats(now);
    await this.purgeStories(now);
    await this.prisma.ingestionRun.deleteMany({
      where: { startedAt: { lt: ingestionRunCutoff(now) } },
    });
    await this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
    await this.prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } });
  }

  private async upsertTagDailyStats(now: Date) {
    const stories = await this.prisma.story.findMany({
      where: { publishedAt: { gte: tagStatWindowStart(now), lte: now } },
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
    await this.prisma.$transaction(
      rows.map(({ day, tag, ...values }) =>
        this.prisma.tagDailyStat.upsert({
          where: { day_tag: { day, tag } },
          create: { day, tag, ...values },
          update: values,
        }),
      ),
    );
  }

  // Stories with a Save are skipped: Save.storyId is onDelete Restrict, and saved stories outlive retention.
  private async purgeStories(now: Date) {
    for (;;) {
      const batch = await this.prisma.story.findMany({
        where: { publishedAt: { lt: storyCutoff(now) }, saves: { none: {} } },
        select: { id: true },
        take: PURGE_BATCH_SIZE,
      });
      if (batch.length === 0) return;
      await this.prisma.story.deleteMany({ where: { id: { in: batch.map(({ id }) => id) } } });
    }
  }
}
