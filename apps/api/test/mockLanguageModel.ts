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
  { usage = RECORDED_USAGE, chunkSize = 40, finishReason = 'stop' } = {},
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

/** A provider stream that delivers `parts` at once, with no timers, so fake-timer tests control the clock. */
export function replayStream(parts: readonly StreamPart[]) {
  return {
    stream: simulateReadableStream({
      chunks: [...parts],
      initialDelayInMs: null,
      chunkDelayInMs: null,
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
