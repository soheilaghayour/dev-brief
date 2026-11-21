import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

/** A summary-like output schema, and an object that matches it. */
export const TldrSchema = z.object({ tldr: z.array(z.string()).length(3) });
export const VALID_TLDR = { tldr: ['one', 'two', 'three'] };

/** Token counts in the shape a Haiku 5.5 response reports them, thinking off. */
export const RECORDED_USAGE = { inputTokens: 1_800, outputTokens: 240 };

/** A provider reply whose text is `body` (JSON for structured output) with the given usage. */
export function modelReply(body: unknown, usage = RECORDED_USAGE): GenerateResult {
  return {
    content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }],
    finishReason: { unified: 'stop', raw: 'end_turn' },
    usage: {
      inputTokens: {
        total: usage.inputTokens,
        noCache: usage.inputTokens,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: usage.outputTokens, text: usage.outputTokens, reasoning: undefined },
    },
    warnings: [],
  };
}

export type StreamPart =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer PART>
    ? PART
    : never;

/** The provider parts of a text reply that arrives in chunks of `chunkSize` characters. */
export function streamParts(
  body: unknown,
  {
    usage = RECORDED_USAGE,
    chunkSize = 40,
    finishReason = 'stop',
  }: {
    usage?: typeof RECORDED_USAGE;
    chunkSize?: number;
    finishReason?: 'stop' | 'content-filter' | 'length';
  } = {},
): StreamPart[] {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const deltas = text.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, 'g')) ?? [];
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    ...deltas.map((delta) => ({ type: 'text-delta' as const, id: 'text-1', delta })),
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish',
      finishReason: { unified: finishReason, raw: finishReason },
      usage: modelReply('', usage).usage,
    },
  ];
}

/** A provider stream that delivers `parts` at once, with no timers, so fake-timer tests control the clock; it errors when `abortSignal` aborts, as a fetch body does. */
export function replayStream(
  parts: readonly StreamPart[],
  { abortSignal }: { abortSignal?: AbortSignal } = {},
) {
  const reader = simulateReadableStream({
    chunks: [...parts],
    initialDelayInMs: null,
    chunkDelayInMs: null,
  }).getReader();
  return {
    stream: new ReadableStream<StreamPart>({
      start(controller) {
        abortSignal?.addEventListener('abort', () => controller.error(abortSignal.reason), {
          once: true,
        });
      },
      async pull(controller) {
        if (abortSignal?.aborted) return;
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      cancel: (reason) => reader.cancel(reason),
    }),
  };
}

/** A mock model whose streams come from `doStream`, so each test can script them. */
export function mockStreamingModel(doStream: MockLanguageModelV4['doStream']) {
  return new MockLanguageModelV4({ provider: 'anthropic', modelId: 'claude-haiku-5-5', doStream });
}

/** A mock model whose replies come from `doGenerate`, so each test can script them. */
export function mockLanguageModel(doGenerate: MockLanguageModelV4['doGenerate']) {
  return new MockLanguageModelV4({
    provider: 'anthropic',
    modelId: 'claude-haiku-5-5',
    doGenerate,
  });
}
