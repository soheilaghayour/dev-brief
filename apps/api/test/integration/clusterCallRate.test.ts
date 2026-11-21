import { Output } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  costFromUsage,
  estimateTokens,
  LLM_CAP_CLUSTER_USD_DAY,
  LLM_PRICES_PER_MTOK,
} from '../../src/modules/llm/budget.js';
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

// The settled cost of an average call, which is what the cap limits: the ledger reserves the worst case but keeps the actual usage.
// Input: the ledger's own estimate (2 UTF-8 bytes a token, an over-count) of system prompt, schema and story blocks averages
// about 620 tokens on the snapshots and 440 on the HN window, so 650. Output: a reply like {"match":"none","confidence":0.95}
// is under 20 tokens. 650 × $0.10/1M + 20 × $0.50/1M = $0.000065 + $0.00001 = $0.000075.
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
});
