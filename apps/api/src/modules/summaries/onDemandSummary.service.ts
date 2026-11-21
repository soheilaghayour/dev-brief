import { Inject, Injectable } from '@nestjs/common';
import type { StorySummary } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { findSummary, loadSummaryInputItems } from '../../common/story-card/clusterSummary.js';
import { toStorySummary } from '../../common/story-card/storyCard.mapper.js';
import { Prisma } from '../../generated/prisma/client.js';
import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import { SummariesService } from './summaries.service.js';
import { summaryQuota } from './summaryQuota.js';
import { hasSummaryInput } from '../../common/summary-input/hasSummaryInput.js';

type Requester = { userId?: string; deviceId?: string; ip: string };

/** `created` is answered 201, `cached` 200. */
export type OnDemandResult = { kind: 'cached' | 'created'; summary: StorySummary };

// Every failure of a started generation is a contract error; anything else is a bug and stays one.
function toApiException(error: unknown) {
  if (error instanceof SpendCapReachedError) {
    return new ApiException('SPEND_CAP_REACHED', 'Daily AI budget reached — try again tomorrow.');
  }
  if (error instanceof GenerationFailedError) {
    return new ApiException('GENERATION_FAILED', 'The summary could not be generated.');
  }
  if (error instanceof SummaryInputsUnavailableError) {
    return new ApiException('UPSTREAM_UNAVAILABLE', 'The discussion could not be loaded.');
  }
  return error;
}

/** The on-demand flow of F2.3: cache first, then the summary-input check, then a quota slot, then generation; a generation that fails or finds a stored summary without a model call returns its slot. */
@Injectable()
export class OnDemandSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly summaries: SummariesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async summarize(
    storyId: string,
    requester: Requester,
    now = new Date(),
  ): Promise<OnDemandResult> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, clusterId: true },
    });
    if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');
    // For a cluster member this is the cluster's summary, wherever it is stored.
    const stored = await findSummary(this.prisma, story, this.env.FEATURE_CLUSTERS);
    if (stored) return { kind: 'cached', summary: toStorySummary(stored) };

    // Before the quota slot: a request that can never be summarised costs nobody a slot.
    const items = await loadSummaryInputItems(this.prisma, story, this.env.FEATURE_CLUSTERS);
    if (!hasSummaryInput({ items })) {
      throw new ApiException('NOT_FOUND', 'This story has too little discussion to summarise.');
    }

    const quota = this.quotaOf(requester, now);
    await this.takeSlot(quota);
    try {
      const result = await this.summaries.generate(storyId, 'on_demand', {
        userId: requester.userId,
      });
      // Only `raced` keeps the slot: its model call was made and paid for.
      if (result.kind === 'cached') await this.returnSlot(quota);
      return { kind: result.kind === 'created' ? 'created' : 'cached', summary: result.summary };
    } catch (error) {
      await this.returnSlot(quota);
      throw toApiException(error);
    }
  }

  private quotaOf({ userId, deviceId, ip }: Requester, now: Date) {
    // Validated at startup whenever summaries are on, which is the only time this route exists.
    const secret = this.env.IP_HASH_SECRET ?? '';
    if (userId) return summaryQuota({ kind: 'user', userId }, secret, now);
    if (!deviceId) {
      throw new ApiException('VALIDATION_FAILED', 'A guest must send a deviceId.', {
        details: [{ path: 'deviceId', message: 'Required' }],
      });
    }
    return summaryQuota({ kind: 'guest', ip, deviceId }, secret, now);
  }

  // The limit check is part of the increment, so a concurrent holder's pending release can't make it reject below the real count.
  private async takeSlot(quota: ReturnType<typeof summaryQuota>) {
    const { key, day, limit, resetsAt } = quota;
    const increment = () =>
      this.prisma.rateLimitCounter.updateMany({
        where: { key, day, count: { lt: limit } },
        data: { count: { increment: 1 } },
      });
    if ((await increment()).count === 1) return;
    try {
      await this.prisma.rateLimitCounter.create({ data: { key, day, count: 1 } });
      return;
    } catch (error) {
      // A parallel first request of the day created the row; fall through to the guarded increment.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
    if ((await increment()).count === 1) return;
    throw new ApiException('QUOTA_EXCEEDED', 'Daily summary limit reached.', {
      resetsAt: resetsAt.toISOString(),
    });
  }

  private async returnSlot({ key, day }: ReturnType<typeof summaryQuota>) {
    await this.prisma.rateLimitCounter.update({
      where: { key_day: { key, day } },
      data: { count: { decrement: 1 } },
    });
  }
}
