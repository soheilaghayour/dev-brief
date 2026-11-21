import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { requestHash } from '../clusterPairs.js';
import {
  COPILOT_INJECTED_PHRASES,
  COPILOT_RECORDINGS,
  COPILOT_RETRIEVAL_SETS,
  copilotRequest,
  readCopilotRecording,
} from '../copilotFixtures.js';
import { mockStreamingModel, replayStream } from '../mockLanguageModel.js';
import { budgetFromEnv } from '../../src/modules/llm/budget.js';
import { LlmService } from '../../src/modules/llm/llm.service.js';
import {
  BriefingPlanLlmSchema,
  BriefingSectionLlmSchema,
  BriefingTitleLlmSchema,
} from '../../src/modules/llm/prompts/copilotBriefing.v1.js';
import type { Reservation, SpendLedgerService } from '../../src/modules/llm/spendLedger.service.js';

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

/** Every story id a section cites, wherever its shape keeps one. */
function citedStoryIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(citedStoryIds);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === 'storyId' && typeof child === 'string'
      ? [child]
      : key === 'storyIds' && Array.isArray(child)
        ? child.filter((id): id is string => typeof id === 'string')
        : citedStoryIds(child),
  );
}

/** Replays the recorded stream through the production streaming call and lists what is wrong with the plan. */
async function violationsOf(name: keyof typeof COPILOT_RECORDINGS) {
  const recording = readCopilotRecording(name);
  const violations: string[] = [];
  if (recording.requestHash !== requestHash(await copilotRequest(name))) {
    violations.push('the recording answers another prompt: record it again');
  }
  const llm = new LlmService(
    ledger,
    mockStreamingModel(async (options) => replayStream(recording.parts, options)),
    budgetFromEnv({ LLM_MODEL: 'claude-haiku-5-5' }),
  );
  const plan: { title?: string; sections: unknown[] } = { sections: [] };
  const retrieved = new Set(COPILOT_RETRIEVAL_SETS[name].map((story) => story.id));
  try {
    for await (const event of llm.streamPlan({
      feature: 'copilot',
      schema: BriefingPlanLlmSchema,
      titleSchema: BriefingTitleLlmSchema,
      // The production gate skips a bad section; a recorded plan with one is a violation.
      sectionSchema: z.unknown().transform((section, context) => {
        const checked = BriefingSectionLlmSchema.safeParse(section);
        if (checked.success) return checked.data;
        violations.push(`a section fails its schema: ${checked.error.issues[0]?.message}`);
        context.addIssue({ code: 'custom', message: 'rejected' });
        return z.NEVER;
      }),
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
  const outside = citedStoryIds(plan.sections).filter((id) => !retrieved.has(id));
  if (outside.length > 0)
    violations.push(`the plan cites stories outside the retrieval set: ${outside}`);
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
