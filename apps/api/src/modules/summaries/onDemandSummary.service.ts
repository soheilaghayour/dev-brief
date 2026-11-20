import { Inject, Injectable } from '@nestjs/common';
import type { StorySummary } from '@devbrief/shared';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { toStorySummary } from '../../common/story-card/storyCard.mapper.js';
import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import { SummariesService } from './summaries.service.js';
import { summaryQuota } from './summaryQuota.js';

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

/** The on-demand flow of F2.3: cache first, then a quota slot, then generation; a failed generation returns its slot. */
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
      include: { summary: true },
    });
    if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');
    if (story.summary) return { kind: 'cached', summary: toStorySummary(story.summary) };

    const quota = this.quotaOf(requester, now);
    await this.takeSlot(quota);
    try {
      return await this.summaries.generate(storyId, 'on_demand', { userId: requester.userId });
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

  private async takeSlot(quota: ReturnType<typeof summaryQuota>) {
    const { key, day, limit, resetsAt } = quota;
    const counter = await this.prisma.rateLimitCounter.upsert({
      where: { key_day: { key, day } },
      create: { key, day, count: 1 },
      update: { count: { increment: 1 } },
    });
    if (counter.count <= limit) return;
    await this.returnSlot(quota);
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
