import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  APICallError,
  generateText,
  type LanguageModel,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  Output,
  streamText,
} from 'ai';
import type { z } from 'zod';
import { sleep } from '../../common/http/httpClient.js';
import type { LlmFeature } from '../../generated/prisma/client.js';
import { type Budget, estimateTokens } from './budget.js';
import { GenerationFailedError } from './llm.errors.js';
import { planProgress } from './planProgress.js';
import {
  LLM_BUDGET,
  type Reservation,
  SpendLedgerService,
  type TokenUsage,
} from './spendLedger.service.js';

export const LANGUAGE_MODEL = Symbol('LANGUAGE_MODEL');

/** PRD §8.3: a call gets 30 s in total, its retry included. */
const CALL_TIMEOUT_MS = 30_000;

/** PRD §8.3: a stream that sends no token in 10 s from the call's start is aborted. */
const FIRST_TOKEN_TIMEOUT_MS = 10_000;

const logger = new Logger('LlmService');

// PRD §8.1: no thinking and the lowest effort, so `maxOutputTokens` bounds what a call bills.
const MINIMAL_THINKING = {
  thinking: { type: 'disabled' },
  effort: 'low',
} satisfies AnthropicLanguageModelOptions;

export type StructuredRequest<OBJECT> = {
  feature: LlmFeature;
  schema: z.ZodType<OBJECT>;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  userId?: string;
  refId?: string;
  /** Aborts the call in flight when the caller's budget is spent. */
  signal?: AbortSignal;
};

export type StructuredResult<OBJECT> = {
  object: OBJECT;
  usage: TokenUsage & { costUsd: number };
  model: string;
};

/** The shape every streamed plan has: a title, then sections the caller validates one by one. */
type PlanObject = { title: string; sections: unknown[] };

export type PlanStreamRequest<SECTION> = Omit<StructuredRequest<PlanObject>, 'schema'> & {
  /** The plan's structure only, checked once the stream ends: a section the caller skips must not fail it. */
  schema: z.ZodType<PlanObject, z.ZodTypeDef, unknown>;
  /** The title, checked before it is released; a title that fails ends the call with `invalid_output`. */
  titleSchema: z.ZodType<string>;
  /** Each section, checked before it is released; one that fails is skipped. */
  sectionSchema: z.ZodType<SECTION>;
};

export type PlanStreamEvent<SECTION> =
  | { kind: 'title'; title: string }
  | { kind: 'section'; index: number; section: SECTION }
  | { kind: 'finished'; usage: TokenUsage & { costUsd: number }; model: string };

/** The deadlines of one `streamPlan` call, shared by its attempts. */
type PlanCall = {
  signal: AbortSignal;
  firstTokenTimer: ReturnType<typeof setTimeout>;
};

type StructuredOutput<OBJECT> = ReturnType<typeof Output.object<OBJECT>>;

type Failure =
  | { kind: 'invalid_output' | 'refused'; usage: TokenUsage }
  | { kind: 'provider_error'; usage: TokenUsage | null; retryable: boolean; cause: unknown };

type Attempt<OBJECT> = { kind: 'generated'; object: OBJECT; usage: TokenUsage } | Failure;

/** How often each failure is retried, and after what pause, before the call fails closed. */
const RETRY_POLICY = {
  // PRD §8.2: output that fails the schema gets one retry.
  invalid_output: { retries: 1, delayMs: 0 },
  // The same input refuses again.
  refused: { retries: 0, delayMs: 0 },
  // PRD §8.3: one retry, for the errors `providerFailure` marks retryable.
  provider_error: { retries: 1, delayMs: 2_000 },
} satisfies Record<Failure['kind'], { retries: number; delayMs: number }>;

/** The only way the API calls a model: every attempt reserves its worst case, calls, then settles. */
@Injectable()
export class LlmService {
  constructor(
    private readonly ledger: SpendLedgerService,
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModel,
    @Inject(LLM_BUDGET) private readonly budget: Budget,
  ) {}

  /** Generates an object matching `schema`; throws `GenerationFailedError`, or `SpendCapReachedError` when any attempt's reservation, a retry's included, is refused. */
  async generateStructured<OBJECT>(
    request: StructuredRequest<OBJECT>,
  ): Promise<StructuredResult<OBJECT>> {
    const output = Output.object({ schema: request.schema });
    const inputTokens = await estimateInputTokens(request, output);
    const retried = { invalid_output: 0, refused: 0, provider_error: 0 };
    for (;;) {
      const reservation = await this.ledger.reserve(
        {
          feature: request.feature,
          model: this.budget.model,
          inputTokens,
          maxOutputTokens: request.maxOutputTokens,
          userId: request.userId,
          refId: request.refId,
        },
        new Date(),
      );
      const outcome = await this.callModel(request, output, inputTokens);
      if (outcome.kind === 'generated') return this.settle(reservation, outcome);
      await this.ledger.fail(reservation, outcome.usage);
      const policy = RETRY_POLICY[outcome.kind];
      const retryable = outcome.kind !== 'provider_error' || outcome.retryable;
      if (!retryable || retried[outcome.kind] >= policy.retries) {
        throw new GenerationFailedError(outcome.kind, {
          cause: outcome.kind === 'provider_error' ? outcome.cause : undefined,
        });
      }
      retried[outcome.kind] += 1;
      if (policy.delayMs > 0) await sleep(policy.delayMs);
    }
  }

  /** Streams a plan, yielding its validated title and each completed section as the model writes them, then `finished`. */
  async *streamPlan<SECTION>(
    request: PlanStreamRequest<SECTION>,
  ): AsyncGenerator<PlanStreamEvent<SECTION>, void> {
    const output = Output.object({ schema: request.schema });
    const inputTokens = await estimateInputTokens(request, output);
    const worstCase = { inputTokens, outputTokens: request.maxOutputTokens };
    // Both deadlines run from the call's start, so a retry gets only the time that is left.
    const deadline = new AbortController();
    const expire = (limit: string) => () =>
      deadline.abort(new DOMException(`The stream ran past its ${limit}`, 'TimeoutError'));
    // The SDK's `totalMs` is an AbortSignal.timeout, which fake timers can't advance; these are plain timers.
    const call = {
      signal: request.signal ? AbortSignal.any([request.signal, deadline.signal]) : deadline.signal,
      firstTokenTimer: setTimeout(expire('first-token time'), FIRST_TOKEN_TIMEOUT_MS),
    };
    const totalTimer = setTimeout(expire('total time'), CALL_TIMEOUT_MS);
    try {
      yield* this.attemptPlan(request, output, { inputTokens, worstCase }, call);
    } finally {
      clearTimeout(totalTimer);
      clearTimeout(call.firstTokenTimer);
    }
  }

  private async *attemptPlan<SECTION>(
    request: PlanStreamRequest<SECTION>,
    output: StructuredOutput<PlanObject>,
    { inputTokens, worstCase }: { inputTokens: number; worstCase: TokenUsage },
    call: PlanCall,
  ): AsyncGenerator<PlanStreamEvent<SECTION>, void> {
    for (let retried = 0; ; retried += 1) {
      request.signal?.throwIfAborted();
      const reservation = await this.ledger.reserve(
        {
          feature: request.feature,
          model: this.budget.model,
          inputTokens,
          maxOutputTokens: request.maxOutputTokens,
          userId: request.userId,
          refId: request.refId,
        },
        new Date(),
      );
      const progress = { tokenSeen: false };
      let closed = false;
      try {
        const outcome = yield* this.streamAttempt(request, output, worstCase, progress, call);
        closed = true;
        if (outcome.kind === 'generated') {
          const costUsd = await this.ledger.settle(reservation, outcome.usage);
          yield {
            kind: 'finished',
            usage: { ...outcome.usage, costUsd },
            model: reservation.model,
          };
          return;
        }
        await this.ledger.fail(reservation, outcome.usage);
        // A retry after streamed output would duplicate it, so only a failure before the first token is retried.
        const retryable =
          outcome.kind === 'provider_error' &&
          outcome.retryable &&
          !progress.tokenSeen &&
          retried < RETRY_POLICY.provider_error.retries;
        if (!retryable) {
          throw new GenerationFailedError(outcome.kind, {
            cause: outcome.kind === 'provider_error' ? outcome.cause : undefined,
          });
        }
      } finally {
        // The consumer stopped, or something threw, mid-stream: the provider may have billed, at unknown usage.
        if (!closed) await this.ledger.fail(reservation, worstCase);
      }
      try {
        await sleep(RETRY_POLICY.provider_error.delayMs, call.signal);
      } catch (cause) {
        throw new GenerationFailedError('provider_error', { cause });
      }
    }
  }

  private async *streamAttempt<SECTION>(
    request: PlanStreamRequest<SECTION>,
    output: StructuredOutput<PlanObject>,
    worstCase: TokenUsage,
    progress: { tokenSeen: boolean },
    call: PlanCall,
  ): AsyncGenerator<PlanStreamEvent<SECTION>, Attempt<PlanObject>> {
    // The stream ends quietly on a provider error and reports it only here.
    let streamError: unknown;
    const stopped = new AbortController();
    const result = streamText({
      model: this.model,
      instructions: request.system,
      prompt: request.prompt,
      output,
      maxOutputTokens: request.maxOutputTokens,
      // Retries happen in `streamPlan`, so each attempt reserves and settles its own row.
      maxRetries: 0,
      abortSignal: AbortSignal.any([call.signal, stopped.signal]),
      providerOptions: { anthropic: MINIMAL_THINKING },
      onError: ({ error }) => {
        streamError ??= error;
      },
    });
    // A failed stream rejects all of these; the ones the code below never reaches must not go unhandled.
    for (const settled of [result.output, result.totalUsage, result.finishReason]) {
      Promise.resolve(settled).catch(() => undefined);
    }
    const released = { title: false, sections: 0 };
    function* release(partial: unknown, final: boolean) {
      const { title, sections } = planProgress(partial, final);
      if (title !== undefined && !released.title) {
        released.title = true;
        const checked = request.titleSchema.safeParse(title);
        if (!checked.success) throw new GenerationFailedError('invalid_output');
        yield { kind: 'title', title: checked.data } as const;
      }
      for (; released.sections < sections.length; released.sections += 1) {
        const index = released.sections;
        const section = request.sectionSchema.safeParse(sections[index]);
        if (section.success) yield { kind: 'section', index, section: section.data } as const;
        else logger.warn(`Plan section ${index} failed its schema and was skipped`);
      }
    }
    try {
      // Not `for await`: leaving that loop early cancels the SDK's stream mid-pipe, which rejects unhandled inside the SDK.
      const partials = result.partialOutputStream[Symbol.asyncIterator]();
      for (let step = await partials.next(); !step.done; step = await partials.next()) {
        progress.tokenSeen = true;
        clearTimeout(call.firstTokenTimer);
        yield* release(step.value, false);
      }
      const plan = await result.output;
      const usage = billedTokens(await result.totalUsage, worstCase);
      if ((await result.finishReason) === 'content-filter') return { kind: 'refused', usage };
      yield* release(plan, true);
      return { kind: 'generated', object: plan, usage };
    } catch (error) {
      // The title failed its gate: the stream is abandoned, so what it billed is unknown.
      if (error instanceof GenerationFailedError)
        return { kind: 'invalid_output', usage: worstCase };
      if (streamError === undefined && NoObjectGeneratedError.isInstance(error)) {
        const usage = billedTokens(error.usage, worstCase);
        return error.finishReason === 'content-filter'
          ? { kind: 'refused', usage }
          : { kind: 'invalid_output', usage };
      }
      return providerFailure(streamError ?? error, worstCase);
    } finally {
      // A consumer that stops early must not leave the provider generating, and billing, behind it.
      stopped.abort(new Error('The consumer stopped reading the stream'));
    }
  }

  private async callModel<OBJECT>(
    request: StructuredRequest<OBJECT>,
    output: StructuredOutput<OBJECT>,
    inputTokens: number,
  ): Promise<Attempt<OBJECT>> {
    const worstCase = { inputTokens, outputTokens: request.maxOutputTokens };
    try {
      const result = await generateText({
        model: this.model,
        instructions: request.system,
        prompt: request.prompt,
        output,
        maxOutputTokens: request.maxOutputTokens,
        // Retries happen here in the service, so each attempt reserves and settles its own row.
        maxRetries: 0,
        timeout: { totalMs: CALL_TIMEOUT_MS },
        abortSignal: request.signal,
        providerOptions: { anthropic: MINIMAL_THINKING },
      });
      const usage = billedTokens(result.totalUsage, worstCase);
      // A refusal is a 200 without the object, so `result.output` would throw and lose its usage.
      if (result.finishReason === 'content-filter') return { kind: 'refused', usage };
      return { kind: 'generated', object: result.output, usage };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        const usage = billedTokens(error.usage, worstCase);
        return error.finishReason === 'content-filter'
          ? { kind: 'refused', usage }
          : { kind: 'invalid_output', usage };
      }
      return providerFailure(error, worstCase);
    }
  }

  private async settle<OBJECT>(
    reservation: Reservation,
    outcome: { object: OBJECT; usage: TokenUsage },
  ): Promise<StructuredResult<OBJECT>> {
    const costUsd = await this.ledger.settle(reservation, outcome.usage);
    return {
      object: outcome.object,
      usage: { ...outcome.usage, costUsd },
      model: reservation.model,
    };
  }
}

// The SDK sends the output's JSON schema with the prompt, so it counts as input.
async function estimateInputTokens<OBJECT>(
  request: Pick<StructuredRequest<OBJECT>, 'system' | 'prompt'>,
  output: StructuredOutput<OBJECT>,
) {
  const format = await output.responseFormat;
  const schema = format?.type === 'json' ? JSON.stringify(format.schema) : '';
  return estimateTokens(request.system + request.prompt + schema);
}

// A provider that omits a count is charged its worst case, so missing usage never under-counts spend.
function billedTokens(usage: LanguageModelUsage | undefined, worstCase: TokenUsage): TokenUsage {
  return {
    inputTokens: usage?.inputTokens ?? worstCase.inputTokens,
    outputTokens: usage?.outputTokens ?? worstCase.outputTokens,
  };
}

function providerFailure(error: unknown, worstCase: TokenUsage): Failure {
  const status = APICallError.isInstance(error) ? error.statusCode : undefined;
  // An error status is not billed. A 200 that failed to parse or read, a timeout or a lost connection may have been, at unknown usage.
  if (status !== undefined && status >= 400) {
    return {
      kind: 'provider_error',
      usage: null,
      retryable: status === 429 || status >= 500,
      cause: error,
    };
  }
  // The SDK wraps a lost connection as a retryable APICallError with no status.
  const lostConnection =
    APICallError.isInstance(error) && status === undefined && error.isRetryable;
  return { kind: 'provider_error', usage: worstCase, retryable: lostConnection, cause: error };
}
