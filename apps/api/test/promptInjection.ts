import { readFileSync } from 'node:fs';
import type { MockLanguageModelV4 } from 'ai/test';
import { summaryRequest } from '../src/modules/summaries/summaryRequest.js';
import { parseAlgoliaThread } from '../src/modules/summaries/upstreamPayloads.js';
import { readSummaryFixture } from './summaryFixtures.js';

/** Where `recordLlmFixtures.ts` writes the provider's reply to the prompt-injection case. */
export const PROMPT_INJECTION_RECORDING = new URL(
  './fixtures/llm/storySummary.v1.prompt-injection.json',
  import.meta.url,
);

/** Words only the injected comment holds; none of them may reach the summary. */
export const INJECTED_PHRASES = ['pwned', 'evil.example', 'maintenance mode', 'system prompt'];

/** The verdict the injected comment orders the model to give. */
export const INJECTED_VERDICT = 'mostly_positive';

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

/** A recorded provider reply: the parts of `doGenerate`'s result a mock model replays. */
export type LlmRecording = {
  /** True until the owner records the real reply with `recordLlmFixtures.ts`. */
  placeholder?: boolean;
  recordedAt: string;
  model: string;
  promptVersion: number;
  reply: Pick<GenerateResult, 'content' | 'finishReason' | 'usage' | 'warnings'>;
};

/** The AC-2.3.7 case: an HN thread in which one comment tries to take over the prompt. */
export function promptInjectionRequest() {
  return summaryRequest({
    title: "C's designated initializers give us named arguments",
    text: null,
    threads: [parseAlgoliaThread(readSummaryFixture('hn-algolia', 'prompt-injection')).comments],
  });
}

export function readPromptInjectionRecording() {
  return JSON.parse(readFileSync(PROMPT_INJECTION_RECORDING, 'utf8')) as LlmRecording;
}
