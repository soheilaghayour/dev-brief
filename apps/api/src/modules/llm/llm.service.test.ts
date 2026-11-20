import { APICallError } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { mockLanguageModel, modelReply, RECORDED_USAGE } from '../../../test/mockLanguageModel.js';
import { budgetFromEnv } from './budget.js';
import { GenerationFailedError, SpendCapReachedError } from './llm.errors.js';
import { LlmService } from './llm.service.js';
import type { Reservation, SpendLedgerService, TokenUsage } from './spendLedger.service.js';

const budget = budgetFromEnv({ LLM_MODEL: 'claude-haiku-5-5' });
const TldrSchema = z.object({ tldr: z.array(z.string()).length(3) });
const VALID = { tldr: ['one', 'two', 'three'] };
const request = {
  feature: 'summary_auto',
  schema: TldrSchema,
  system: 's'.repeat(300),
  prompt: 'p'.repeat(300),
  maxOutputTokens: 700,
  refId: 'story-1',
} as const;
// 600 prompt characters plus the 209-character JSON schema the SDK sends estimate to 405 input tokens.
const WORST_CASE = { inputTokens: 405, outputTokens: 700 };

type LedgerEvent =
  | { kind: 'reserve'; id: string }
  | { kind: 'settle' | 'fail'; id: string; usage: TokenUsage | null };

/** An in-memory ledger that records the order of its calls; the Postgres ledger has its own integration tests. */
function fakeLedger(options: { capReachedAfter?: number } = {}) {
  const events: LedgerEvent[] = [];
  let reservations = 0;
  const ledger = {
    reserve: vi.fn(async (): Promise<Reservation> => {
      if (reservations === options.capReachedAfter) {
        throw new SpendCapReachedError('summary_auto', 'feature');
      }
      const id = `reservation-${++reservations}`;
      events.push({ kind: 'reserve', id });
      return { id, model: 'claude-haiku-5-5' };
    }),
    settle: vi.fn(async (reservation: Reservation, usage: TokenUsage) => {
      events.push({ kind: 'settle', id: reservation.id, usage });
      return 0.0003;
    }),
    fail: vi.fn(async (reservation: Reservation, usage: TokenUsage | null) => {
      events.push({ kind: 'fail', id: reservation.id, usage });
    }),
  };
  return { events, ledger: ledger as unknown as SpendLedgerService };
}

function serviceWith(doGenerate: Parameters<typeof mockLanguageModel>[0], ledger = fakeLedger()) {
  const model = mockLanguageModel(doGenerate);
  return { model, ...ledger, service: new LlmService(ledger.ledger, model, budget) };
}

describe('LlmService.generateStructured', () => {
  it('AC-2.6.1 reserves before calling the model and settles at the reported usage', async () => {
    const { service, events, model } = serviceWith(async () => {
      expect(events).toEqual([{ kind: 'reserve', id: 'reservation-1' }]);
      return modelReply(VALID);
    });

    const result = await service.generateStructured(request);

    expect(result).toEqual({
      object: VALID,
      usage: { ...RECORDED_USAGE, costUsd: 0.0003 },
      model: 'claude-haiku-5-5',
    });
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'settle', id: 'reservation-1', usage: RECORDED_USAGE },
    ]);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('sends the system prompt, the output bound, minimal thinking and a JSON schema', async () => {
    const { service, model } = serviceWith(async () => modelReply(VALID));

    await service.generateStructured(request);

    const call = model.doGenerateCalls[0];
    expect(call?.maxOutputTokens).toBe(700);
    expect(call?.providerOptions?.anthropic).toEqual({
      thinking: { type: 'disabled' },
      effort: 'low',
    });
    expect(call?.responseFormat).toMatchObject({ type: 'json', schema: { type: 'object' } });
    expect(call?.prompt[0]).toEqual({ role: 'system', content: request.system });
  });

  it('reserves maxOutputTokens and the input estimated over the prompts and the JSON schema the SDK sends', async () => {
    const ledger = fakeLedger();
    const { service, model } = serviceWith(async () => modelReply(VALID), ledger);

    await service.generateStructured({ ...request, userId: 'user-1' });

    const sent = model.doGenerateCalls[0]?.responseFormat;
    const schemaChars = sent?.type === 'json' ? JSON.stringify(sent.schema).length : 0;
    expect(Math.ceil((600 + schemaChars) / 2)).toBe(WORST_CASE.inputTokens);

    expect(vi.mocked(ledger.ledger.reserve)).toHaveBeenCalledWith(
      {
        feature: 'summary_auto',
        model: 'claude-haiku-5-5',
        inputTokens: WORST_CASE.inputTokens,
        maxOutputTokens: 700,
        userId: 'user-1',
        refId: 'story-1',
      },
      expect.any(Date),
    );
  });

  it('AC-2.6.1 retries invalid output once with its own reservation, then throws GenerationFailedError', async () => {
    const { service, events, model } = serviceWith(async () => modelReply({ tldr: ['only one'] }));

    await expect(service.generateStructured(request)).rejects.toBeInstanceOf(GenerationFailedError);

    expect(model.doGenerateCalls).toHaveLength(2);
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: RECORDED_USAGE },
      { kind: 'reserve', id: 'reservation-2' },
      { kind: 'fail', id: 'reservation-2', usage: RECORDED_USAGE },
    ]);
  });

  it('returns the second attempt when only the first output is invalid', async () => {
    const replies = [modelReply('not json'), modelReply(VALID)];
    const { service, events } = serviceWith(async () => replies.shift() ?? modelReply(VALID));

    await expect(service.generateStructured(request)).resolves.toMatchObject({ object: VALID });

    expect(events.map(({ kind }) => kind)).toEqual(['reserve', 'fail', 'reserve', 'settle']);
  });

  it('propagates SpendCapReachedError from the schema retry reservation without calling the model again', async () => {
    const { service, model } = serviceWith(
      async () => modelReply({ tldr: [] }),
      fakeLedger({ capReachedAfter: 1 }),
    );

    await expect(service.generateStructured(request)).rejects.toBeInstanceOf(SpendCapReachedError);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('never calls the model when the first reservation is refused', async () => {
    const { service, model } = serviceWith(
      async () => modelReply(VALID),
      fakeLedger({ capReachedAfter: 0 }),
    );

    await expect(service.generateStructured(request)).rejects.toBeInstanceOf(SpendCapReachedError);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('settles a provider error status at zero and fails closed without a retry', async () => {
    const { service, events, model } = serviceWith(async () => {
      throw apiError(400);
    });

    await expect(service.generateStructured(request)).rejects.toMatchObject({
      name: 'GenerationFailedError',
      reason: 'provider_error',
    });

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: null },
    ]);
  });

  it('does not retry a 408 or 409, which PRD §8.3 does not name', async () => {
    for (const statusCode of [408, 409]) {
      const { service, model } = serviceWith(async () => {
        throw apiError(statusCode);
      });

      await expect(service.generateStructured(request)).rejects.toBeInstanceOf(
        GenerationFailedError,
      );
      expect(model.doGenerateCalls).toHaveLength(1);
    }
  });

  it('settles a 200 whose body failed to parse at its worst case, since it was billed', async () => {
    const { service, events, model } = serviceWith(async () => {
      throw apiError(200, 'Failed to process successful response');
    });

    await expect(service.generateStructured(request)).rejects.toBeInstanceOf(GenerationFailedError);

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: WORST_CASE },
    ]);
  });

  it('settles a call that hit the 30 s timeout at its worst case, without a retry', async () => {
    const { service, events, model } = serviceWith(async (options) => {
      expect(options.abortSignal).toBeInstanceOf(AbortSignal);
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });

    await expect(service.generateStructured(request)).rejects.toBeInstanceOf(GenerationFailedError);

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: WORST_CASE },
    ]);
  });

  it.each([
    ['no text', ''],
    ['refusal text', 'I can not help with that.'],
  ])(
    'settles a refusal with %s at its actual usage and fails closed without a retry',
    async (_case, text) => {
      const { service, events, model } = serviceWith(async () => ({
        ...modelReply(text),
        finishReason: { unified: 'content-filter', raw: 'refusal' },
      }));

      await expect(service.generateStructured(request)).rejects.toMatchObject({
        name: 'GenerationFailedError',
        reason: 'refused',
      });

      expect(model.doGenerateCalls).toHaveLength(1);
      expect(events).toEqual([
        { kind: 'reserve', id: 'reservation-1' },
        { kind: 'fail', id: 'reservation-1', usage: RECORDED_USAGE },
      ]);
    },
  );

  describe('provider retry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('retries a 5xx once with its own reservation, settling each attempt at zero', async () => {
      const { service, events, model } = serviceWith(async () => {
        throw apiError(529);
      });

      await expect(pastRetryPause(service.generateStructured(request))).rejects.toMatchObject({
        name: 'GenerationFailedError',
        reason: 'provider_error',
      });

      expect(model.doGenerateCalls).toHaveLength(2);
      expect(events).toEqual([
        { kind: 'reserve', id: 'reservation-1' },
        { kind: 'fail', id: 'reservation-1', usage: null },
        { kind: 'reserve', id: 'reservation-2' },
        { kind: 'fail', id: 'reservation-2', usage: null },
      ]);
    });

    it('returns the reply when a 429 is followed by a success', async () => {
      const replies = [apiError(429), modelReply(VALID)];
      const { service, events } = serviceWith(async () => {
        const reply = replies.shift();
        if (reply instanceof Error) throw reply;
        return reply ?? modelReply(VALID);
      });

      await expect(pastRetryPause(service.generateStructured(request))).resolves.toMatchObject({
        object: VALID,
      });
      expect(events.map(({ kind }) => kind)).toEqual(['reserve', 'fail', 'reserve', 'settle']);
    });

    it('retries a lost connection once, settling each attempt at its worst case, since it may have been billed', async () => {
      const { service, events, model } = serviceWith(async () => {
        throw lostConnection();
      });

      await expect(pastRetryPause(service.generateStructured(request))).rejects.toBeInstanceOf(
        GenerationFailedError,
      );

      expect(model.doGenerateCalls).toHaveLength(2);
      expect(events).toEqual([
        { kind: 'reserve', id: 'reservation-1' },
        { kind: 'fail', id: 'reservation-1', usage: WORST_CASE },
        { kind: 'reserve', id: 'reservation-2' },
        { kind: 'fail', id: 'reservation-2', usage: WORST_CASE },
      ]);
    });

    it('propagates SpendCapReachedError when the retry reservation is refused', async () => {
      const { service, model } = serviceWith(
        async () => {
          throw apiError(503);
        },
        fakeLedger({ capReachedAfter: 1 }),
      );

      await expect(pastRetryPause(service.generateStructured(request))).rejects.toBeInstanceOf(
        SpendCapReachedError,
      );
      expect(model.doGenerateCalls).toHaveLength(1);
    });
  });
});

// Runs the pause before a provider retry; the early `catch` keeps a rejection from counting as unhandled meanwhile.
async function pastRetryPause<T>(call: Promise<T>) {
  call.catch(() => {});
  await vi.runAllTimersAsync();
  return call;
}

// Built like provider-utils builds them, with its default `isRetryable` for the status.
function apiError(statusCode: number, message = `status ${statusCode}`) {
  return new APICallError({
    message,
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode,
  });
}

// What provider-utils throws for ECONNRESET or "fetch failed": no status, retryable.
function lostConnection() {
  return new APICallError({
    message: 'Cannot connect to API: socket hang up',
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    isRetryable: true,
  });
}
