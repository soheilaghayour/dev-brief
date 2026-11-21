import { Output } from 'ai';
import { beforeAll, describe, expect, it } from 'vitest';
import { readPairsRecording } from '../clusterPairs.js';
import {
  costFromUsage,
  estimateTokens,
  LLM_CAP_CLUSTER_USD_DAY,
  LLM_PRICES_PER_MTOK,
} from '../../src/modules/llm/budget.js';
import { CLUSTER_MAX_CALLS_PER_RUN } from '../../src/modules/clustering/clusteringRules.js';
import {
  buildClusterMatchPrompt,
  candidateLabel,
  clusterMatchSchema,
  SYSTEM_PROMPT,
} from '../../src/modules/llm/prompts/clusterMatch.v1.js';
import {
  HN_WINDOW_NEW_DAY,
  modelCalls,
  readHnWindowStories,
  readSnapshotStories,
} from '../clusterSnapshots.js';

// PRD §8.1: the top of the 200–400 new stories a day the cluster cap is sized for.
const NEW_STORIES_PER_DAY = 400;
const CAP_HEADROOM = 0.3;

// The expected settled cost of a call, derived in PRD §8.1.
const EXPECTED_INPUT_TOKENS_PER_CALL = 650;
const EXPECTED_OUTPUT_TOKENS_PER_CALL = 20;
const EXPECTED_COST_PER_CALL_USD = costFromUsage(
  {
    inputTokens: EXPECTED_INPUT_TOKENS_PER_CALL,
    outputTokens: EXPECTED_OUTPUT_TOKENS_PER_CALL,
    model: 'claude-haiku-5-5',
  },
  LLM_PRICES_PER_MTOK,
);

/** The input tokens `LlmService` estimates for a call: system prompt, user prompt and the output's JSON schema. */
async function estimatedInputTokens(call: ReturnType<typeof modelCalls>['calls'][number]) {
  const labels = call.candidates.map((_, index) => candidateLabel(index));
  const format = await Output.object({ schema: clusterMatchSchema(labels) }).responseFormat;
  const schema = format?.type === 'json' ? JSON.stringify(format.schema) : '';
  return estimateTokens(
    SYSTEM_PROMPT + buildClusterMatchPrompt(call.story, call.candidates) + schema,
  );
}

async function measure(name: string, { created, calls }: ReturnType<typeof modelCalls>) {
  const inputs = await Promise.all(calls.map(estimatedInputTokens));
  const meanInput = inputs.reduce((sum, tokens) => sum + tokens, 0) / inputs.length;
  const callsPerDay = (calls.length / created) * NEW_STORIES_PER_DAY;
  const dailyUsd = callsPerDay * EXPECTED_COST_PER_CALL_USD;
  process.stderr.write(
    `\n${name}: ${calls.length} of ${created} new stories reach the model (${callsPerDay.toFixed(0)} calls on a 400-story day), mean estimated input ${meanInput.toFixed(0)} tokens, $${dailyUsd.toFixed(4)}/day against the $${LLM_CAP_CLUSTER_USD_DAY} cap\n`,
  );
  return { meanInput, dailyUsd };
}

describe('clustering pre-filter model calls', () => {
  it('keep a 400-story day of the recorded snapshots 30% under the cluster cap', async () => {
    const { meanInput, dailyUsd } = await measure(
      'recorded snapshots',
      modelCalls(await readSnapshotStories()),
    );
    expect(meanInput).toBeLessThanOrEqual(EXPECTED_INPUT_TOKENS_PER_CALL);
    expect(dailyUsd).toBeLessThanOrEqual(LLM_CAP_CLUSTER_USD_DAY * (1 - CAP_HEADROOM));
  });

  // The snapshots' windows hold far fewer stories than production's ~1,200, which is what most spurious candidates come from.
  it('keep a production-sized day of HN stories 30% under the cluster cap', async () => {
    const isNew = ({ publishedAt }: { publishedAt: Date }) =>
      publishedAt >= HN_WINDOW_NEW_DAY.from && publishedAt < HN_WINDOW_NEW_DAY.to;
    const { meanInput, dailyUsd } = await measure(
      'HN window',
      modelCalls(await readHnWindowStories(), isNew),
    );
    expect(meanInput).toBeLessThanOrEqual(EXPECTED_INPUT_TOKENS_PER_CALL);
    expect(dailyUsd).toBeLessThanOrEqual(LLM_CAP_CLUSTER_USD_DAY * (1 - CAP_HEADROOM));
  });

  it('CLUSTER_MAX_CALLS_PER_RUN is 100', () => {
    expect(CLUSTER_MAX_CALLS_PER_RUN).toBe(100);
  });

  beforeAll(() => {
    if (readPairsRecording().placeholder !== true) return;
    // Straight to stderr: the default reporter hides console output of a passing file.
    process.stderr.write(
      '\nWARNING, 1 test SKIPPED: the cluster recording is still a placeholder, so the real per-call cost is unchecked (issue #82).\n\n',
    );
  });

  // Hand-written usage proves nothing about the real cost.
  it.skipIf(readPairsRecording().placeholder === true)(
    'the recorded replies cost no more per call than the expected settled cost',
    () => {
      const { replies, model } = readPairsRecording();
      const costs = Object.values(replies).map(({ usage }) =>
        costFromUsage(
          {
            inputTokens: usage.inputTokens.total ?? 0,
            outputTokens: usage.outputTokens.total ?? 0,
            model,
          },
          LLM_PRICES_PER_MTOK,
        ),
      );
      const mean = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
      expect(mean).toBeLessThanOrEqual(EXPECTED_COST_PER_CALL_USD);
    },
  );
});
