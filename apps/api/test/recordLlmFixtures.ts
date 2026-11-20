// Records the live model's reply to the prompt-injection case once; tests replay it. Usage: test/fixtures/llm/README.md.
import { writeFileSync } from 'node:fs';
import { createAnthropic } from '@ai-sdk/anthropic';
import { type LanguageModel, wrapLanguageModel } from 'ai';
import { loadEnv } from '../src/env.js';
import { budgetFromEnv } from '../src/modules/llm/budget.js';
import { LlmService } from '../src/modules/llm/llm.service.js';
import {
  MAX_OUTPUT_TOKENS,
  PROMPT_VERSION,
  StorySummaryLlmSchema,
} from '../src/modules/llm/prompts/storySummary.v1.js';
import type { Reservation, SpendLedgerService } from '../src/modules/llm/spendLedger.service.js';
import {
  type LlmRecording,
  PROMPT_INJECTION_RECORDING,
  promptInjectionRequest,
} from './promptInjection.js';

const env = loadEnv();
if (!env.ANTHROPIC_API_KEY) throw new Error('Set ANTHROPIC_API_KEY to record the LLM fixtures.');

let reply: LlmRecording['reply'] | undefined;
const recordingModel = wrapLanguageModel({
  model: createAnthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: 'https://api.anthropic.com/v1',
  })(env.LLM_MODEL),
  middleware: {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      const { content, finishReason, usage, warnings } = result;
      reply = { content, finishReason, usage, warnings };
      return result;
    },
  },
});

// There is no database here, so a stand-in ledger admits the call; one recording costs well under $0.001.
const ledger = {
  reserve: async (request: { model: string }): Promise<Reservation> => ({
    id: 'recording',
    model: request.model,
  }),
  settle: async () => 0,
  fail: async () => undefined,
} as unknown as SpendLedgerService;

// The same LlmService call the summaries module makes, so the recorded reply answers the production request.
const llm = new LlmService(ledger, recordingModel as LanguageModel, budgetFromEnv(env));
const { system, prompt } = promptInjectionRequest();
const { object } = await llm.generateStructured({
  feature: 'summary_on_demand',
  schema: StorySummaryLlmSchema,
  system,
  prompt,
  maxOutputTokens: MAX_OUTPUT_TOKENS,
});
if (!reply) throw new Error('The model call returned without a reply to record.');

const recording: LlmRecording = {
  recordedAt: new Date().toISOString(),
  model: env.LLM_MODEL,
  promptVersion: PROMPT_VERSION,
  reply,
};
writeFileSync(PROMPT_INJECTION_RECORDING, `${JSON.stringify(recording, null, 2)}\n`);
console.log(`Recorded ${PROMPT_INJECTION_RECORDING.pathname}:`, JSON.stringify(object, null, 2));
