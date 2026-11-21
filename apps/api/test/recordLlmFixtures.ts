// Records the live model's replies once; tests replay them. Usage: test/fixtures/llm/README.md.
import { writeFileSync } from 'node:fs';
import { createAnthropic } from '@ai-sdk/anthropic';
import { type LanguageModel, wrapLanguageModel } from 'ai';
import { loadEnv } from '../src/env.js';
import { budgetFromEnv } from '../src/modules/llm/budget.js';
import { GenerationFailedError } from '../src/modules/llm/llm.errors.js';
import { LlmService } from '../src/modules/llm/llm.service.js';
import * as clusterMatch from '../src/modules/llm/prompts/clusterMatch.v1.js';
import * as storySummary from '../src/modules/llm/prompts/storySummary.v1.js';
import type { Reservation, SpendLedgerService } from '../src/modules/llm/spendLedger.service.js';
import {
  CLUSTER_PAIRS_RECORDING,
  type PairsRecording,
  pairRequest,
  readClusterPairs,
  readHeldOutPairs,
  requestHash,
} from './clusterPairs.js';
import {
  type LlmRecording,
  PROMPT_INJECTION_RECORDING,
  promptInjectionRequest,
} from './promptInjection.js';

const targets = process.argv[2] ?? 'all';
if (!['all', 'injection', 'pairs'].includes(targets)) {
  throw new Error('Usage: tsx test/recordLlmFixtures.ts [all|injection|pairs]');
}

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

// There is no database ledger here, so a stand-in admits the call; one recording costs well under $0.001.
const ledger = {
  reserve: async (request: { model: string }): Promise<Reservation> => ({
    id: 'recording',
    model: request.model,
  }),
  settle: async () => 0,
  fail: async () => undefined,
} as unknown as SpendLedgerService;

// The same LlmService call the production modules make, so a recorded reply answers the production request.
const llm = new LlmService(ledger, recordingModel as LanguageModel, budgetFromEnv(env));

function takeReply() {
  if (!reply) throw new Error('The model call returned without a reply to record.');
  const recorded = reply;
  reply = undefined;
  return recorded;
}

async function recordPromptInjection() {
  const { system, prompt } = promptInjectionRequest();
  const { object } = await llm.generateStructured({
    feature: 'summary_on_demand',
    schema: storySummary.StorySummaryLlmSchema,
    system,
    prompt,
    maxOutputTokens: storySummary.MAX_OUTPUT_TOKENS,
  });
  const recording: LlmRecording = {
    recordedAt: new Date().toISOString(),
    model: env.LLM_MODEL,
    promptVersion: storySummary.PROMPT_VERSION,
    reply: takeReply(),
  };
  writeFileSync(PROMPT_INJECTION_RECORDING, `${JSON.stringify(recording, null, 2)}\n`);
  console.log(`Recorded ${PROMPT_INJECTION_RECORDING.pathname}:`, JSON.stringify(object, null, 2));
}

async function recordClusterPairs() {
  const replies: PairsRecording['replies'] = {};
  const requestHashes: PairsRecording['requestHashes'] = {};
  for (const pair of [...readClusterPairs(), ...readHeldOutPairs()]) {
    const request = pairRequest(pair);
    // The pre-filter cuts this pair, so production would make no call for it.
    if (!request) continue;
    try {
      const { object } = await llm.generateStructured({
        feature: 'cluster',
        ...request,
        maxOutputTokens: clusterMatch.MAX_OUTPUT_TOKENS,
      });
      console.log(`${pair.label.padEnd(9)} ${pair.id}: ${JSON.stringify(object)}`);
    } catch (error) {
      // Output the model got wrong is a result to replay, so the replay leaves the story single as production does.
      if (!(error instanceof GenerationFailedError) || error.reason === 'provider_error')
        throw error;
      console.log(`${pair.label.padEnd(9)} ${pair.id}: ${error.reason}`);
    }
    replies[pair.id] = takeReply();
    requestHashes[pair.id] = requestHash(request);
  }
  const recording: PairsRecording = {
    recordedAt: new Date().toISOString(),
    model: env.LLM_MODEL,
    promptVersion: clusterMatch.PROMPT_VERSION,
    replies,
    requestHashes,
  };
  writeFileSync(CLUSTER_PAIRS_RECORDING, `${JSON.stringify(recording, null, 2)}\n`);
  console.log(
    `Recorded ${Object.keys(replies).length} replies to ${CLUSTER_PAIRS_RECORDING.pathname}`,
  );
}

if (targets !== 'pairs') await recordPromptInjection();
if (targets !== 'injection') await recordClusterPairs();
