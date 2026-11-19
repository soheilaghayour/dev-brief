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

  /** Runs the steps in order; a failing step is logged and does not skip the ones after it. */
  async runDaily(now: Date) {
    const steps = [
      ['tag rollup', () => this.recomputeTagDailyStats(now)],
      ['story purge', () => this.purgeStories(now)],
      [
        'ingestion run purge',
        () =>
          this.prisma.ingestionRun.deleteMany({
            where: { startedAt: { lt: ingestionRunCutoff(now) } },
          }),
      ],
      [
        'session purge',
        () => this.prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      ],
      [
        'verification purge',
        () => this.prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
      ],
    ] as const;
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error) {
        this.logger.error(`Daily step "${name}" failed: ${String(error)}`);
      }
    }
  }

  private async recomputeTagDailyStats(now: Date) {
    const windowStart = tagStatWindowStart(now);
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

  // Stories with a Save are skipped: Save.storyId is onDelete Restrict, and saved stories outlive retention.
  private async purgeStories(now: Date) {
    for (;;) {
      const batch = await this.prisma.story.findMany({
        where: { publishedAt: { lt: storyCutoff(now) }, saves: { none: {} } },
        select: { id: true },
        take: PURGE_BATCH_SIZE,
      });
      if (batch.length === 0) return;
      await this.prisma.story.deleteMany({
        // Repeats the Save guard: a Save may land between the lookup and the delete.
        where: { id: { in: batch.map(({ id }) => id) }, saves: { none: {} } },
      });
    }
  }
}
