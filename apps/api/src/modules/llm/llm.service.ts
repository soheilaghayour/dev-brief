import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { Inject, Injectable } from '@nestjs/common';
import {
  APICallError,
  generateText,
  type LanguageModel,
  type LanguageModelUsage,
  NoObjectGeneratedError,
  Output,
  RetryError,
} from 'ai';
import type { z } from 'zod';
import { type Budget, estimateTokens, type LlmFeature } from './budget.js';
import { GenerationFailedError } from './llm.errors.js';
import {
  LLM_BUDGET,
  type Reservation,
  SpendLedgerService,
  type TokenUsage,
} from './spendLedger.service.js';

export const LANGUAGE_MODEL = Symbol('LANGUAGE_MODEL');

/** PRD §8.3: one Anthropic call, retries included, gets 30 s and one retry on 5xx or 429. */
const CALL_TIMEOUT_MS = 30_000;
const PROVIDER_RETRIES = 1;
/** PRD §8.2: output that fails the schema is retried once, then the call fails closed. */
const SCHEMA_ATTEMPTS = 2;

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
};

export type StructuredResult<OBJECT> = {
  object: OBJECT;
  usage: TokenUsage & { costUsd: number };
  model: string;
};

type Attempt<OBJECT> =
  | { kind: 'generated'; object: OBJECT; usage: TokenUsage }
  | { kind: 'invalid'; usage: TokenUsage }
  | { kind: 'provider_failed'; usage: TokenUsage | null; error: unknown };

/** The only way the API calls a model: every attempt reserves its worst case, calls, then settles. */
@Injectable()
export class LlmService {
  constructor(
    private readonly ledger: SpendLedgerService,
    @Inject(LANGUAGE_MODEL) private readonly model: LanguageModel,
    @Inject(LLM_BUDGET) private readonly budget: Budget,
  ) {}

  /** Generates an object matching `schema`; throws `SpendCapReachedError` or `GenerationFailedError`. */
  async generateStructured<OBJECT>(
    request: StructuredRequest<OBJECT>,
  ): Promise<StructuredResult<OBJECT>> {
    const inputTokens = estimateTokens(request.system + request.prompt);
    for (let attempt = 1; attempt <= SCHEMA_ATTEMPTS; attempt++) {
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
      const outcome = await this.callModel(request, inputTokens);
      if (outcome.kind === 'generated') return this.settle(reservation, outcome);
      await this.ledger.fail(reservation, outcome.usage);
      if (outcome.kind === 'provider_failed') {
        throw new GenerationFailedError('The model call failed.', { cause: outcome.error });
      }
    }
    throw new GenerationFailedError(
      `The model output failed schema validation ${SCHEMA_ATTEMPTS} times.`,
    );
  }

  private async callModel<OBJECT>(
    request: StructuredRequest<OBJECT>,
    inputTokens: number,
  ): Promise<Attempt<OBJECT>> {
    const worstCase = { inputTokens, outputTokens: request.maxOutputTokens };
    try {
      const result = await generateText({
        model: this.model,
        instructions: request.system,
        prompt: request.prompt,
        output: Output.object({ schema: request.schema }),
        maxOutputTokens: request.maxOutputTokens,
        maxRetries: PROVIDER_RETRIES,
        timeout: { totalMs: CALL_TIMEOUT_MS },
        providerOptions: { anthropic: MINIMAL_THINKING },
      });
      return {
        kind: 'generated',
        object: result.output,
        usage: billedTokens(result.totalUsage, worstCase),
      };
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        return { kind: 'invalid', usage: billedTokens(error.usage, worstCase) };
      }
      // An error status is not billed; a timeout or lost connection may have been, so it counts its worst case.
      return { kind: 'provider_failed', usage: answeredWithError(error) ? null : worstCase, error };
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

// A provider that omits a count is charged its worst case, so missing usage never under-counts spend.
function billedTokens(usage: LanguageModelUsage | undefined, worstCase: TokenUsage): TokenUsage {
  return {
    inputTokens: usage?.inputTokens ?? worstCase.inputTokens,
    outputTokens: usage?.outputTokens ?? worstCase.outputTokens,
  };
}

function answeredWithError(error: unknown) {
  const last = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(last) && last.statusCode !== undefined;
}
