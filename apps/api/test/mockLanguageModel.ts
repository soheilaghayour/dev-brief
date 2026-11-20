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

/** A mock model whose replies come from `doGenerate`, so each test can script them. */
export function mockLanguageModel(doGenerate: MockLanguageModelV4['doGenerate']) {
  return new MockLanguageModelV4({
    provider: 'anthropic',
    modelId: 'claude-haiku-5-5',
    doGenerate,
  });
}
