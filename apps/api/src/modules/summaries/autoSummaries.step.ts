import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { topWindowStart } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { IngestionPostRunSteps, type IngestionPostRunStep } from '../ingestion/postRunStep.js';
import { utcDay } from '../llm/budget.js';
import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';
import { SummariesService } from './summaries.service.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import { AUTO_SUMMARIES_PER_DAY, autoCandidateIds } from './summaryRules.js';

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

  async run({ now }: { now: Date }) {
    // CI's e2e API runs with summaries on and a placeholder key, so the live calls need a switch of their own.
    if (!this.env.FEATURE_SUMMARIES || !this.env.AUTO_SUMMARIES) return;

    let remaining = AUTO_SUMMARIES_PER_DAY - (await this.countToday(now));
    if (remaining <= 0) return;
    for (const storyId of await this.candidateIds(now)) {
      try {
        const { kind } = await this.summaries.generate(storyId, 'auto');
        if (kind === 'created') remaining -= 1;
      } catch (error) {
        if (error instanceof SpendCapReachedError) {
          this.logger.warn(`Auto summaries stopped: ${error.message}`);
          return;
        }
        // The story stays unsummarised, so a later run tries it again.
        if (
          error instanceof GenerationFailedError ||
          error instanceof SummaryInputsUnavailableError
        ) {
          this.logger.warn(`Auto summary of story ${storyId} failed: ${error.message}`);
          continue;
        }
        throw error;
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
  private async candidateIds(now: Date) {
    const stories = await this.prisma.story.findMany({
      where: { publishedAt: { gte: topWindowStart(now) }, summary: null },
      select: { id: true, items: { select: { commentsCount: true } } },
      orderBy: [{ rankScore: 'desc' }, { id: 'desc' }],
    });
    return autoCandidateIds(stories);
  }
}
