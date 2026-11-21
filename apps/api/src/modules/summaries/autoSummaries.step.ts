import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { topWindowStart } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import {
  IngestionPostRunSteps,
  type IngestionPostRunStep,
  type PostRunContext,
} from '../ingestion/postRunStep.js';
import { utcDay } from '../../common/time/utcDay.js';
import type { LedgerStatus } from '../llm/budget.js';
import { SummariesService } from './summaries.service.js';
import {
  AUTO_SUMMARIES_PER_DAY,
  autoCandidates,
  autoFailureAction,
  fitsRunBudget,
} from './summaryRules.js';

/** After each ingestion run, summarises the most-discussed Top stories until the day's auto summaries are used up. */
@Injectable()
export class AutoSummariesStep implements IngestionPostRunStep, OnModuleInit {
  readonly name = 'auto-summaries';
  private readonly logger = new Logger(AutoSummariesStep.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly summaries: SummariesService,
    private readonly postRunSteps: IngestionPostRunSteps,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    this.postRunSteps.register(this);
  }

  async run({ now, signal }: PostRunContext) {
    // CI's e2e API runs with summaries on and a placeholder key, so the live calls need a switch of their own.
    if (!this.env.FEATURE_SUMMARIES || !this.env.AUTO_SUMMARIES) return;

    let remaining = AUTO_SUMMARIES_PER_DAY - (await this.countToday(now));
    if (remaining <= 0) return;
    const used = { attempts: 0, hnRequests: 0 };
    for (const candidate of await this.candidates(now)) {
      if (!fitsRunBudget(candidate, used)) continue;
      if (signal.aborted) {
        this.logger.warn('Auto summaries stopped: the run budget is spent');
        return;
      }
      const storyId = candidate.id;
      used.attempts += 1;
      used.hnRequests += candidate.hnRequests;
      try {
        const { kind } = await this.summaries.generate(storyId, 'auto', { signal });
        if (kind === 'created') remaining -= 1;
        // A summary found stored made no HN request, so its share goes back to the run.
        if (kind === 'cached') used.hnRequests -= candidate.hnRequests;
      } catch (error) {
        const action = autoFailureAction(error);
        if (action === 'unexpected') throw error;
        this.logger.warn(`Auto summary of story ${storyId} failed (${action}): ${String(error)}`);
        if (action === 'stop') return;
      }
      if (remaining <= 0) return;
    }
  }

  /** Auto summaries created since the start of `now`'s UTC day. */
  private countToday(now: Date) {
    return this.prisma.summary.count({
      where: { trigger: 'auto', createdAt: { gte: utcDay(now) } },
    });
  }

  // Older stories keep a frozen rankScore and never reach Top, so the Top window bounds the candidates.
  private async candidates(now: Date) {
    const [stories, failedToday] = await Promise.all([
      this.loadStories(now),
      this.loadFailedToday(now),
    ]);
    return autoCandidates(stories, failedToday);
  }

  // With clusters on a candidate is a primary story, judged by its whole cluster; off, every story is its own.
  private async loadStories(now: Date) {
    const itemSelect = { commentsCount: true, source: { select: { kind: true } } } as const;
    const clusters = this.env.FEATURE_CLUSTERS;
    const rows = await this.prisma.story.findMany({
      where: {
        publishedAt: { gte: topWindowStart(now) },
        summary: null,
        ...(clusters && {
          isPrimary: true,
          // A summary on any member covers the whole cluster.
          OR: [
            { clusterId: null },
            { cluster: { stories: { none: { summary: { isNot: null } } } } },
          ],
        }),
      },
      select: {
        id: true,
        clusterId: true,
        items: { select: itemSelect },
        // Loaded only for clustered stories, and read only with the flag on.
        cluster: { select: { stories: { select: { items: { select: itemSelect } } } } },
      },
      orderBy: [{ rankScore: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      clusterId: clusters ? row.clusterId : null,
      items:
        clusters && row.cluster ? row.cluster.stories.flatMap((member) => member.items) : row.items,
    }));
  }

  // A story whose auto call failed today would most likely fail again, so it waits for tomorrow; with clusters on its whole cluster does, since the representative may have moved.
  private async loadFailedToday(now: Date) {
    const failedToday = await this.prisma.llmUsage.findMany({
      where: {
        day: utcDay(now),
        feature: 'summary_auto',
        status: 'failed' satisfies LedgerStatus,
        refId: { not: null },
      },
      select: { refId: true },
      distinct: ['refId'],
    });
    const refIds = failedToday.flatMap(({ refId }) => (refId ? [refId] : []));
    if (!this.env.FEATURE_CLUSTERS) return new Set(refIds);
    const failedStories = await this.prisma.story.findMany({
      where: { id: { in: refIds } },
      select: { id: true, clusterId: true },
    });
    const clusterOf = new Map(failedStories.map((story) => [story.id, story.clusterId]));
    return new Set(refIds.map((refId) => clusterOf.get(refId) ?? refId));
  }
}
