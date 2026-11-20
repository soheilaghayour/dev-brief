import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  aggregateTagStats,
  clusterNeedsUpkeep,
  copilotQueryCutoff,
  ingestionRunCutoff,
  planClusterUpkeep,
  llmUsageCutoff,
  PURGE_BATCH_SIZE,
  rateLimitCounterCutoff,
  storyCutoff,
  tagStatWindowStart,
} from './dailyRules.js';

/** The daily job: tag rollup first, then retention and the cluster upkeep it needs. */
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
      ['cluster upkeep', () => this.upkeepClusters()],
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
      [
        'LLM usage purge',
        () => this.prisma.llmUsage.deleteMany({ where: { day: { lt: llmUsageCutoff(now) } } }),
      ],
      [
        'rate limit counter purge',
        () =>
          this.prisma.rateLimitCounter.deleteMany({
            where: { day: { lt: rateLimitCounterCutoff(now) } },
          }),
      ],
      [
        'copilot query purge',
        () =>
          this.prisma.copilotQuery.deleteMany({
            where: { createdAt: { lt: copilotQueryCutoff(now) } },
          }),
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
      if (batch.length === 0) break;
      await this.prisma.story.deleteMany({
        // Repeats the Save guard: a Save may land between the lookup and the delete.
        where: { id: { in: batch.map(({ id }) => id) }, saves: { none: {} } },
      });
    }
  }

  /** Repairs every broken cluster found in the database, so an interrupted purge is repaired by the next run. */
  private async upkeepClusters() {
    const clusters = await this.prisma.cluster.findMany({
      select: {
        id: true,
        representativeStoryId: true,
        memberCount: true,
        stories: { select: { id: true, isPrimary: true } },
      },
    });
    const broken = clusters.filter(({ stories, ...cluster }) =>
      clusterNeedsUpkeep({ ...cluster, members: stories }),
    );
    for (const { id: clusterId } of broken) {
      const members = await this.prisma.story.findMany({
        where: { clusterId },
        select: {
          id: true,
          rankScore: true,
          items: { select: { source: { select: { kind: true } } } },
        },
      });
      const upkeep = planClusterUpkeep(
        clusterId,
        members.map(({ items, ...member }) => ({
          ...member,
          kinds: items.map((item) => item.source.kind),
        })),
      );
      if (upkeep.action === 'dissolve') {
        // clusterScore stays: it records the clustering decision, not membership (AC-2.1.3).
        await this.prisma.$transaction([
          this.prisma.story.updateMany({
            where: { clusterId },
            data: { clusterId: null, isPrimary: true },
          }),
          this.prisma.cluster.deleteMany({ where: { id: clusterId } }),
        ]);
        continue;
      }
      await this.prisma.$transaction([
        this.prisma.cluster.update({
          where: { id: clusterId },
          data: {
            memberCount: upkeep.memberCount,
            sourceKinds: upkeep.sourceKinds,
            representativeStoryId: upkeep.representativeStoryId,
            rankScore: upkeep.rankScore,
          },
        }),
        this.prisma.story.updateMany({ where: { clusterId }, data: { isPrimary: false } }),
        this.prisma.story.update({
          where: { id: upkeep.representativeStoryId },
          data: { isPrimary: true },
        }),
      ]);
    }
  }
}
