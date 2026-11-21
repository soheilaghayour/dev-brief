import { APICallError } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  mockLanguageModel,
  mockStreamingModel,
  modelReply,
  RECORDED_USAGE,
  replayStream,
  type StreamPart,
  streamParts,
  TldrSchema,
  VALID_TLDR as VALID,
} from '../../../test/mockLanguageModel.js';
import { budgetFromEnv } from './budget.js';
import { GenerationFailedError, SpendCapReachedError } from './llm.errors.js';
import { LlmService } from './llm.service.js';
import type { Reservation, SpendLedgerService, TokenUsage } from './spendLedger.service.js';

const budget = budgetFromEnv({ LLM_MODEL: 'claude-haiku-5-5' });
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

const StreamedPlanSchema = z.object({
  title: z.string(),
  sections: z.array(z.object({ kind: z.string(), text: z.string() })),
});
const StreamedSectionSchema = StreamedPlanSchema.shape.sections.element.refine(
  (section) => !section.text.includes('http'),
);
const streamRequest = {
  feature: 'copilot',
  schema: StreamedPlanSchema,
  sectionSchema: StreamedSectionSchema,
  system: 's'.repeat(300),
  prompt: 'p'.repeat(300),
  maxOutputTokens: 1_500,
} as const;
const PLAN = {
  title: 'Plan',
  sections: [
    { kind: 'a', text: 'one' },
    { kind: 'b', text: 'two' },
    { kind: 'c', text: 'three' },
  ],
};
const PLAN_TEXT = JSON.stringify(PLAN);
const WORST_CASE_OUTPUT = expect.objectContaining({ outputTokens: 1_500 });

/** A promise the test resolves by hand, to hold a provider stream back until the consumer has caught up. */
function gate() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolveGate) => {
    resolve = resolveGate;
  });
  return { promise, resolve };
}

function streamServiceWith(
  doStream: Parameters<typeof mockStreamingModel>[0],
  ledger = fakeLedger(),
) {
  const model = mockStreamingModel(doStream);
  return { model, ...ledger, service: new LlmService(ledger.ledger, model, budget) };
}

/** Drains the iterator, returning what it yielded and the error that ended it, if any. */
async function drain<T>(iterator: AsyncGenerator<T, void>) {
  const yielded: T[] = [];
  let error: unknown;
  try {
    for await (const event of iterator) yielded.push(event);
  } catch (caught) {
    error = caught;
  }
  return { yielded, error };
}

/** A provider stream that stays open and errors when the call is aborted, as a hung connection does. */
function hangingStream(options: { abortSignal?: AbortSignal }, firstText?: string) {
  return {
    stream: new ReadableStream<StreamPart>({
      start(controller) {
        const parts = streamParts(firstText ?? '', { chunkSize: 10_000 });
        for (const part of parts.slice(0, firstText ? 3 : 1)) {
          controller.enqueue(part);
        }
        options.abortSignal?.addEventListener('abort', () =>
          controller.error(options.abortSignal?.reason),
        );
      },
    }),
  };
}

describe('LlmService.streamPlan', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-3.1.6 releases the title and each section in order as it completes, before the stream ends', async () => {
    const sectionTwoStart = PLAN_TEXT.indexOf('{"kind":"c"') + 4;
    const opened = gate();
    const { service } = streamServiceWith(async () => ({
      stream: new ReadableStream<StreamPart>({
        async start(controller) {
          const parts = streamParts(PLAN_TEXT, { chunkSize: sectionTwoStart });
          // Everything up to the start of the third section, then wait for the consumer to have the first two.
          for (const part of parts.slice(0, 3)) controller.enqueue(part);
          await opened.promise;
          for (const part of parts.slice(3)) controller.enqueue(part);
          controller.close();
        },
      }),
    }));

    const seen: string[] = [];
    for await (const event of service.streamPlan(streamRequest)) {
      seen.push(event.kind === 'section' ? `section ${event.index}` : event.kind);
      if (event.kind === 'section' && event.index === 1) opened.resolve();
    }

    expect(seen).toEqual(['title', 'section 0', 'section 1', 'section 2', 'finished']);
  });

  it('releases the last section only when the stream ends', async () => {
    const lastStart = PLAN_TEXT.indexOf('{"kind":"c"');
    const opened = gate();
    const { service } = streamServiceWith(async () => ({
      stream: new ReadableStream<StreamPart>({
        async start(controller) {
          const parts = streamParts(PLAN_TEXT.slice(0, -2), { chunkSize: PLAN_TEXT.length });
          // The whole text but the closing `}]}`, which arrives after the test has looked.
          for (const part of parts.slice(0, 3)) controller.enqueue(part);
          await opened.promise;
          controller.enqueue({ type: 'text-delta', id: 'text-1', delta: PLAN_TEXT.slice(-2) });
          for (const part of parts.slice(4)) controller.enqueue(part);
          controller.close();
        },
      }),
    }));
    expect(lastStart).toBeGreaterThan(0);

    const iterator = service.streamPlan(streamRequest);
    const first = await iterator.next();
    const second = await iterator.next();
    const third = await iterator.next();
    expect([first.value, second.value, third.value]).toMatchObject([
      { kind: 'title' },
      { kind: 'section', index: 0 },
      { kind: 'section', index: 1 },
    ]);
    opened.resolve();
    const rest = await drain(iterator);
    expect(rest.yielded.map(({ kind }) => kind)).toEqual(['section', 'finished']);
  });

  it('AC-2.6.1 reserves before the model call and settles at the reported usage', async () => {
    const { service, events, model } = streamServiceWith(async () => {
      expect(events).toEqual([{ kind: 'reserve', id: 'reservation-1' }]);
      return replayStream(streamParts(PLAN_TEXT));
    });

    const { yielded, error } = await drain(service.streamPlan(streamRequest));

    expect(error).toBeUndefined();
    expect(yielded.at(-1)).toEqual({
      kind: 'finished',
      usage: { ...RECORDED_USAGE, costUsd: 0.0003 },
      model: 'claude-haiku-5-5',
    });
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'settle', id: 'reservation-1', usage: RECORDED_USAGE },
    ]);
    expect(model.doStreamCalls[0]?.maxOutputTokens).toBe(1_500);
    expect(model.doStreamCalls[0]?.providerOptions?.anthropic).toEqual({
      thinking: { type: 'disabled' },
      effort: 'low',
    });
  });

  it('skips a section that fails its schema and keeps the others at their plan index', async () => {
    const plan = {
      ...PLAN,
      sections: [PLAN.sections[0], { kind: 'b', text: 'see http://x' }, PLAN.sections[2]],
    };
    const { service } = streamServiceWith(async () => replayStream(streamParts(plan)));

    const { yielded } = await drain(service.streamPlan(streamRequest));

    expect(yielded.flatMap((event) => (event.kind === 'section' ? [event.index] : []))).toEqual([
      0, 2,
    ]);
  });

  it('settles an output that fails the plan schema at its usage, without a retry', async () => {
    const { service, events, model } = streamServiceWith(async () =>
      replayStream(streamParts({ title: 'No sections' })),
    );

    const { error } = await drain(service.streamPlan(streamRequest));

    expect(error).toMatchObject({ name: 'GenerationFailedError', reason: 'invalid_output' });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: RECORDED_USAGE },
    ]);
  });

  it('settles a refusal at its usage as failed, without a retry', async () => {
    const { service, events, model } = streamServiceWith(async () =>
      replayStream(streamParts('', { finishReason: 'content-filter' })),
    );

    const { error } = await drain(service.streamPlan(streamRequest));

    expect(error).toMatchObject({ reason: 'refused' });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(events.at(-1)).toEqual({ kind: 'fail', id: 'reservation-1', usage: RECORDED_USAGE });
  });

  it('AC-3.1.9 aborts after 10 s without a first token and settles the row at its worst case', async () => {
    const { service, events, model } = streamServiceWith(async (options) => hangingStream(options));

    const done = drain(service.streamPlan(streamRequest));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(events).toEqual([{ kind: 'reserve', id: 'reservation-1' }]);
    await vi.advanceTimersByTimeAsync(2);
    const { yielded, error } = await done;

    expect(yielded).toEqual([]);
    expect(error).toMatchObject({ name: 'GenerationFailedError', reason: 'provider_error' });
    // A timeout is not retried: a second wait would double the user's.
    expect(model.doStreamCalls).toHaveLength(1);
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: WORST_CASE_OUTPUT },
    ]);
  });

  it('AC-3.1.9 aborts a stream still running after 30 s, keeping the sections it released', async () => {
    const partial = PLAN_TEXT.slice(0, PLAN_TEXT.indexOf('{"kind":"c"') + 5);
    const { service, events } = streamServiceWith(async (options) =>
      hangingStream(options, partial),
    );

    const done = drain(service.streamPlan(streamRequest));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(events).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    const { yielded, error } = await done;

    expect(yielded.map(({ kind }) => kind)).toEqual(['title', 'section', 'section']);
    expect(error).toMatchObject({ reason: 'provider_error' });
    expect(events.at(-1)).toEqual({ kind: 'fail', id: 'reservation-1', usage: WORST_CASE_OUTPUT });
  });

  it('retries a 5xx before the first token once, with its own reservation', async () => {
    let calls = 0;
    const { service, events, model } = streamServiceWith(async () => {
      calls += 1;
      if (calls === 1) throw apiError(529);
      return replayStream(streamParts(PLAN_TEXT));
    });

    const done = drain(service.streamPlan(streamRequest));
    await vi.advanceTimersByTimeAsync(2_000);
    const { yielded, error } = await done;

    expect(error).toBeUndefined();
    expect(yielded.at(-1)).toMatchObject({ kind: 'finished' });
    expect(model.doStreamCalls).toHaveLength(2);
    expect(events.map(({ kind }) => kind)).toEqual(['reserve', 'fail', 'reserve', 'settle']);
    expect(events[1]).toEqual({ kind: 'fail', id: 'reservation-1', usage: null });
  });

  it('does not retry a 5xx after the first token: a retry would duplicate the output', async () => {
    const partial = PLAN_TEXT.slice(0, PLAN_TEXT.indexOf('{"kind":"b"') + 5);
    const { service, events, model } = streamServiceWith(async () => ({
      stream: new ReadableStream<StreamPart>({
        start(controller) {
          const parts = streamParts(partial, { chunkSize: 10_000 });
          for (const part of parts.slice(0, 3)) controller.enqueue(part);
          controller.enqueue({ type: 'error', error: apiError(529) });
          controller.close();
        },
      }),
    }));

    const done = drain(service.streamPlan(streamRequest));
    await vi.advanceTimersByTimeAsync(5_000);
    const { yielded, error } = await done;

    expect(yielded.map(({ kind }) => kind)).toEqual(['title', 'section']);
    expect(error).toMatchObject({ reason: 'provider_error' });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(events.map(({ kind }) => kind)).toEqual(['reserve', 'fail']);
  });

  it('propagates SpendCapReachedError without calling the model', async () => {
    const { service, model } = streamServiceWith(
      async () => replayStream(streamParts(PLAN_TEXT)),
      fakeLedger({ capReachedAfter: 0 }),
    );

    const { yielded, error } = await drain(service.streamPlan(streamRequest));

    expect(error).toBeInstanceOf(SpendCapReachedError);
    expect(yielded).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(0);
  });

  it('AC-3.1.9 stops the model call when the caller aborts, and settles the row at its worst case', async () => {
    const controller = new AbortController();
    const { service, events, model } = streamServiceWith(async (options) => hangingStream(options));

    const done = drain(service.streamPlan({ ...streamRequest, signal: controller.signal }));
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.advanceTimersByTimeAsync(100);
    const { error } = await done;

    expect(model.doStreamCalls[0]?.abortSignal?.aborted).toBe(true);
    expect(error).toMatchObject({ reason: 'provider_error' });
    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: WORST_CASE_OUTPUT },
    ]);
  });

  it('settles the row at its worst case when the consumer stops iterating early', async () => {
    const { service, events } = streamServiceWith(async () => replayStream(streamParts(PLAN_TEXT)));

    for await (const event of service.streamPlan(streamRequest)) {
      if (event.kind === 'title') break;
    }

    expect(events).toEqual([
      { kind: 'reserve', id: 'reservation-1' },
      { kind: 'fail', id: 'reservation-1', usage: WORST_CASE_OUTPUT },
    ]);
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
