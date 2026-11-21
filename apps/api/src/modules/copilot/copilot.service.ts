import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  A2uiServerMessageSchema,
  type A2uiServerMessage,
  type CopilotAskRequest,
} from '@devbrief/shared';
import { z } from 'zod';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';
import { BriefingPipelineService } from './briefingPipeline.service.js';
import { closestExample } from './closestExample.js';
import { copilotQuota, type CopilotQuotaPlan } from './copilotQuota.js';
import { CopilotQuotaService } from './copilotQuota.service.js';
import type { CopilotSseEvent } from './copilotSse.js';
import { normalizeQuestion, questionHash } from './normalizeQuestion.js';

type Requester = { userId?: string; ip: string };

const CACHE_WINDOW_MS = 24 * 3_600_000;
const StoredMessagesSchema = z.array(A2uiServerMessageSchema);
const logger = new Logger('Copilot');

const GENERATION_FAILED = {
  event: 'error',
  data: { code: 'GENERATION_FAILED', message: 'The briefing could not be generated.' },
} as const satisfies CopilotSseEvent;

const INTERNAL = {
  event: 'error',
  data: { code: 'INTERNAL', message: 'Something went wrong.' },
} as const satisfies CopilotSseEvent;

// Zod's inferred message type has no index signature, so Prisma's JSON input type rejects it though it is plain JSON.
const json = (messages: readonly A2uiServerMessage[]) =>
  messages as unknown as Prisma.InputJsonValue;

/** The flow of F3.1: cache, then a quota slot, then the pipeline, with the fallbacks and refunds around it. */
@Injectable()
export class CopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: BriefingPipelineService,
    private readonly slots: CopilotQuotaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Answers 429 before the stream starts; the stream it returns persists its row even when the reader stops. */
  async ask(
    request: CopilotAskRequest,
    requester: Requester,
    signal: AbortSignal,
  ): Promise<AsyncGenerator<CopilotSseEvent, void>> {
    const now = new Date();
    const quota = this.quotaOf(requester, request.deviceId, now);
    // A question of only punctuation normalises to nothing, so every such question would share one cache key.
    if (!normalizeQuestion(request.question)) {
      throw new ApiException('VALIDATION_FAILED', 'The question must contain words.', {
        details: [{ path: 'question', message: 'Must contain more than punctuation' }],
      });
    }
    const hash = questionHash(request.question);
    const cached = await this.prisma.copilotQuery.findFirst({
      where: {
        questionHash: hash,
        status: 'complete',
        createdAt: { gte: new Date(now.getTime() - CACHE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (cached) return this.replay(cached, quota);
    // Taken before the retrieval so the 429 can still be a JSON error; a thin-coverage answer gives it back.
    await this.slots.take(quota);
    // Created before the stream starts, so a database failure is still a JSON 500 and not an error inside an event stream.
    const row = await this.createRow({
      question: request.question,
      hash,
      userId: requester.userId,
      quota,
    });
    return this.generate({
      row,
      question: request.question,
      userId: requester.userId,
      quota,
      signal,
    });
  }

  /** What is left of the requester's daily questions; a guest must name its device. */
  quota(requester: Requester, deviceId: string | undefined) {
    if (!requester.userId && !deviceId) {
      throw new ApiException('VALIDATION_FAILED', 'A guest must send a deviceId.', {
        details: [{ path: 'deviceId', message: 'Required' }],
      });
    }
    return this.slots.status(this.quotaOf(requester, deviceId ?? '', new Date()));
  }

  private quotaOf({ userId, ip }: Requester, deviceId: string, now: Date) {
    // Validated at startup whenever the copilot is on, which is the only time its routes exist.
    const secret = this.env.IP_HASH_SECRET ?? '';
    return userId
      ? copilotQuota({ kind: 'user', userId }, secret, now)
      : copilotQuota({ kind: 'guest', ip, deviceId }, secret, now);
  }

  private async *replay(
    cached: { id: string; messages: Prisma.JsonValue },
    quota: CopilotQuotaPlan,
  ): AsyncGenerator<CopilotSseEvent, void> {
    yield {
      event: 'meta',
      data: { queryId: cached.id, cached: true, quota: await this.slots.status(quota) },
    };
    for (const data of StoredMessagesSchema.parse(cached.messages)) yield { event: 'a2ui', data };
    yield { event: 'done', data: {} };
  }

  private async *generate({
    row,
    question,
    userId,
    quota,
    signal,
  }: {
    row: { id: string };
    question: string;
    userId: string | undefined;
    quota: CopilotQuotaPlan;
    signal: AbortSignal;
  }): AsyncGenerator<CopilotSseEvent, void> {
    const sent: A2uiServerMessage[] = [];
    let sectionSent = false;
    let metaSent = false;
    let settled = false;
    // The row's final state and the slot's fate are decided once, whichever way the stream ends.
    const settle = async (update: Prisma.CopilotQueryUpdateInput, refund: boolean) => {
      if (settled) return;
      settled = true;
      if (refund) await this.slots.release(quota);
      await this.updateRow(row.id, update);
    };
    const meta = async (fallback?: 'SPEND_CAP' | 'NO_COVERAGE'): Promise<CopilotSseEvent> => ({
      event: 'meta',
      data: {
        queryId: row.id,
        cached: false,
        ...(fallback && { fallback }),
        quota: await this.slots.status(quota),
      },
    });
    // The error event always follows a meta, so the client has the queryId and quota whichever way the stream broke.
    const failure = async function* (refund: boolean, error: CopilotSseEvent = GENERATION_FAILED) {
      await settle({ status: 'failed', messages: json(sent) }, refund);
      if (!metaSent) yield await meta();
      yield error;
    };

    try {
      const run = this.pipeline.run({
        question,
        surfaceId: `briefing-${row.id}`,
        refId: row.id,
        signal,
        userId,
      });
      for await (const event of run) {
        if (event.kind === 'no_coverage') {
          await settle({ status: 'no_coverage', messages: json(event.messages) }, true);
          yield await meta('NO_COVERAGE');
          for (const data of event.messages) yield { event: 'a2ui', data };
          yield { event: 'done', data: {} };
          return;
        }
        if (event.kind === 'message') {
          if (!metaSent) {
            metaSent = true;
            yield await meta();
          }
          sent.push(event.message);
          yield { event: 'a2ui', data: event.message };
          // Set only once the reader asked for the next event, i.e. after the message was written: a reader that left before it holds no section.
          sectionSent ||= event.section;
        } else if (event.kind === 'complete') {
          await settle(
            {
              status: 'complete',
              messages: json(sent),
              storyIds: event.storyIds,
              inputTokens: event.usage.inputTokens,
              outputTokens: event.usage.outputTokens,
              costUsd: event.costUsd,
            },
            false,
          );
          yield { event: 'done', data: { usage: { ...event.usage, costUsd: event.costUsd } } };
          return;
        } else {
          yield* failure(!sectionSent);
          return;
        }
      }
    } catch (error) {
      if (error instanceof SpendCapReachedError && !metaSent) {
        yield* this.serveExample(question, settle, meta);
      } else if (error instanceof GenerationFailedError || signal.aborted) {
        yield* failure(!sectionSent);
      } else {
        logger.error(error);
        yield* failure(!sectionSent, INTERNAL);
      }
    } finally {
      // The reader went away (or something unexpected threw) before the stream ended: a stored `failed` row, refunded unless a section went out.
      await settle({ status: 'failed', messages: json(sent) }, !sectionSent);
    }
  }

  /** The `streaming` row of the question; the slot is given back when it can't be written, since no stream follows to settle it. */
  private async createRow({
    question,
    hash,
    userId,
    quota,
  }: {
    question: string;
    hash: string;
    userId: string | undefined;
    quota: CopilotQuotaPlan;
  }) {
    try {
      return await this.prisma.copilotQuery.create({
        data: {
          userId,
          guestKey: quota.guestKey,
          question,
          questionHash: hash,
          status: 'streaming',
          messages: [],
          storyIds: [],
        },
        select: { id: true },
      });
    } catch (error) {
      await this.slots.release(quota);
      throw error;
    }
  }

  /** The closest example briefing, with the slot given back: a spent budget is not the reader's doing. */
  private async *serveExample(
    question: string,
    settle: (update: Prisma.CopilotQueryUpdateInput, refund: boolean) => Promise<void>,
    meta: (fallback?: 'SPEND_CAP') => Promise<CopilotSseEvent>,
  ): AsyncGenerator<CopilotSseEvent, void> {
    const example = closestExample(question, await this.prisma.exampleBriefing.findMany());
    if (!example) {
      await settle({ status: 'failed', messages: [] }, true);
      yield await meta();
      yield {
        event: 'error',
        data: {
          code: 'SPEND_CAP_REACHED',
          message: 'Daily AI budget reached — try again tomorrow.',
        },
      };
      return;
    }
    const messages = StoredMessagesSchema.parse(example.messages);
    await settle({ status: 'fallback', messages: json(messages) }, true);
    yield await meta('SPEND_CAP');
    for (const data of messages) yield { event: 'a2ui', data };
    yield { event: 'done', data: {} };
  }

  // The row is gone when its user deleted the account while the stream ran (P2025): there is nothing left to update.
  private async updateRow(id: string, data: Prisma.CopilotQueryUpdateInput) {
    try {
      await this.prisma.copilotQuery.update({ where: { id }, data });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')) {
        throw error;
      }
    }
  }
}
