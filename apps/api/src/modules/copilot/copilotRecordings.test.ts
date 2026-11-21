import { beforeAll, describe, expect, it } from 'vitest';
import { requestHash } from '../../../test/clusterPairs.js';
import {
  COPILOT_INJECTED_PHRASES,
  COPILOT_RECORDINGS,
  copilotRequest,
  readCopilotRecording,
} from '../../../test/copilotFixtures.js';
import { mockStreamingModel, replayStream } from '../../../test/mockLanguageModel.js';
import { budgetFromEnv } from '../llm/budget.js';
import { LlmService } from '../llm/llm.service.js';
import {
  BriefingPlanLlmSchema,
  BriefingSectionLlmSchema,
} from '../llm/prompts/copilotBriefing.v1.js';
import type { Reservation, SpendLedgerService } from '../llm/spendLedger.service.js';

const NAMES = Object.keys(COPILOT_RECORDINGS) as (keyof typeof COPILOT_RECORDINGS)[];

// There is no database here; a stand-in ledger admits the one replayed call.
const ledger = {
  reserve: async (request: { model: string }): Promise<Reservation> => ({
    id: 'recording',
    model: request.model,
  }),
  settle: async () => 0,
  fail: async () => undefined,
} as unknown as SpendLedgerService;

/** Replays the recorded stream through the production streaming call and lists what is wrong with the plan. */
async function violationsOf(name: keyof typeof COPILOT_RECORDINGS) {
  const recording = readCopilotRecording(name);
  const violations: string[] = [];
  if (recording.requestHash !== requestHash(await copilotRequest(name))) {
    violations.push('the recording answers another prompt: record it again');
  }
  const llm = new LlmService(
    ledger,
    mockStreamingModel(async () => replayStream(recording.parts)),
    budgetFromEnv({ LLM_MODEL: 'claude-haiku-5-5' }),
  );
  const plan: { title?: string; sections: unknown[] } = { sections: [] };
  try {
    for await (const event of llm.streamPlan({
      feature: 'copilot',
      schema: BriefingPlanLlmSchema,
      sectionSchema: BriefingSectionLlmSchema,
      system: '',
      prompt: '',
      maxOutputTokens: 1_500,
    })) {
      if (event.kind === 'title') plan.title = event.title;
      if (event.kind === 'section') plan.sections.push(event.section);
    }
  } catch (error) {
    violations.push(`the plan does not parse: ${String(error)}`);
  }
  const text = JSON.stringify(plan).toLowerCase();
  if (/https?:\/\//.test(text)) violations.push('the plan contains a URL');
  for (const phrase of COPILOT_INJECTED_PHRASES) {
    if (text.includes(phrase)) violations.push(`the plan repeats the injected text "${phrase}"`);
  }
  return violations;
}

describe('recorded copilot streams', () => {
  const placeholders = NAMES.filter((name) => readCopilotRecording(name).placeholder === true);

  beforeAll(() => {
    if (placeholders.length === 0) return;
    // Straight to stderr: the default reporter hides console output of a passing file.
    process.stderr.write(
      `\nWARNING, ${placeholders.length} tests SKIPPED: the copilot LLM recordings (${placeholders.join(', ')}) are still placeholders. Record them before FEATURE_COPILOT goes on (issue #97, apps/api/test/fixtures/llm/README.md).\n\n`,
    );
  });

  for (const name of NAMES) {
    const isPlaceholder = readCopilotRecording(name).placeholder === true;

    // A hand-written reply proves nothing, so the check waits for the real recording.
    it.skipIf(isPlaceholder)(
      `AC-3.1.6 the recorded ${name} plan parses, with no URL and no text from the injected instruction`,
      async () => {
        expect(await violationsOf(name)).toEqual([]);
      },
    );

    // Deleting the flag without recording must fail the check above instead of passing it.
    it.runIf(isPlaceholder)(
      `the ${name} placeholder breaks the recorded-reply checks, so removing its flag cannot pass`,
      async () => {
        expect(await violationsOf(name)).not.toEqual([]);
      },
    );
  }
});
