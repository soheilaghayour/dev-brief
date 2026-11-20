import { APICallError } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { mockLanguageModel, modelReply, RECORDED_USAGE } from '../../../test/mockLanguageModel.js';
import { budgetFromEnv } from './budget.js';
import { GenerationFailedError, SpendCapReachedError } from './llm.errors.js';
import { LlmService } from './llm.service.js';
import type { Reservation, SpendLedgerService, TokenUsage } from './spendLedger.service.js';

const budget = budgetFromEnv({ LLM_MODEL: 'claude-haiku-5-5' });
const TldrSchema = z.object({ tldr: z.array(z.string()).length(3) });
const VALID = { tldr: ['one', 'two', 'three'] };
// 600 characters estimate to 200 input tokens.
const request = {
  feature: 'summary_auto',
  schema: TldrSchema,
  system: 's'.repeat(300),
  prompt: 'p'.repeat(300),
  maxOutputTokens: 700,
  refId: 'story-1',
} as const;
const WORST_CASE = { inputTokens: 200, outputTokens: 700 };

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

  it('reserves the estimated input and maxOutputTokens', async () => {
    const ledger = fakeLedger();
    const { service } = serviceWith(async () => modelReply(VALID), ledger);

    await service.generateStructured({ ...request, userId: 'user-1' });

    expect(vi.mocked(ledger.ledger.reserve)).toHaveBeenCalledWith(
      {
        feature: 'summary_auto',
        model: 'claude-haiku-5-5',
        inputTokens: 200,
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

  it('propagates SpendCapReachedError from the retry reservation without calling the model again', async () => {
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

  it('settles a provider error status at zero and fails closed without a schema retry', async () => {
    const { service, events, model } = serviceWith(async () => {
      throw apiError(400);
    });

    await expect(service.generateStructured(request)).rejects.toBeInstanceOf(GenerationFailedError);

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: null },
    ]);
  });

  it('retries a 5xx once within the same reservation, then settles it at zero', async () => {
    const { service, events, model } = serviceWith(async () => {
      throw apiError(529);
    });

    await expect(service.generateStructured(request)).rejects.toBeInstanceOf(GenerationFailedError);

    expect(model.doGenerateCalls).toHaveLength(2);
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: null },
    ]);
  }, 15_000);

  it('returns the reply when a 429 is followed by a success', async () => {
    let calls = 0;
    const { service, model } = serviceWith(async () => {
      calls += 1;
      if (calls === 1) throw apiError(429);
      return modelReply(VALID);
    });

    await expect(service.generateStructured(request)).resolves.toMatchObject({ object: VALID });
    expect(model.doGenerateCalls).toHaveLength(2);
  }, 15_000);

  it('settles a call that lost its connection at its worst case, since it may have been billed', async () => {
    const { service, events } = serviceWith(async () => {
      throw new Error('socket hang up');
    });

    await expect(service.generateStructured(request)).rejects.toBeInstanceOf(GenerationFailedError);

    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: WORST_CASE },
    ]);
  });
});

function apiError(statusCode: number) {
  return new APICallError({
    message: `status ${statusCode}`,
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode,
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}
