import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  aggregateTagStats,
  planClusterUpkeep,
  ingestionRunCutoff,
  llmUsageCutoff,
  PURGE_BATCH_SIZE,
  rateLimitCounterCutoff,
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
    const touchedClusterIds = new Set<string>();
    for (;;) {
      const batch = await this.prisma.story.findMany({
        where: { publishedAt: { lt: storyCutoff(now) }, saves: { none: {} } },
        select: { id: true, clusterId: true },
        take: PURGE_BATCH_SIZE,
      });
      if (batch.length === 0) break;
      for (const { clusterId } of batch) if (clusterId) touchedClusterIds.add(clusterId);
      await this.prisma.story.deleteMany({
        // Repeats the Save guard: a Save may land between the lookup and the delete.
        where: { id: { in: batch.map(({ id }) => id) }, saves: { none: {} } },
      });
    }
    await this.upkeepClusters([...touchedClusterIds]);
  }

  /** Recounts every cluster that lost members; one left (or none) dissolves it into a single primary story. */
  private async upkeepClusters(clusterIds: string[]) {
    for (const clusterId of clusterIds) {
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
        await this.prisma.$transaction([
          this.prisma.story.updateMany({
            where: { clusterId },
            data: { clusterId: null, isPrimary: true, clusterScore: null },
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
        this.prisma.story.updateMany({
          where: { clusterId },
          data: { isPrimary: false },
        }),
        this.prisma.story.update({
          where: { id: upkeep.representativeStoryId },
          data: { isPrimary: true },
        }),
      ]);
    }
  }
}
