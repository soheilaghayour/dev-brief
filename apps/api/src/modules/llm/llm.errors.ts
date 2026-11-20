import type { LlmFeature } from '../../generated/prisma/client.js';

const CAP_MESSAGES = {
  feature: (feature: LlmFeature) => `The daily ${feature} LLM spend cap is reached.`,
  global: () => 'The daily global LLM spend cap is reached.',
  ledger_timeout: () => "Today's LLM spend could not be checked in time.",
} satisfies Record<string, (feature: LlmFeature) => string>;

/** A call's worst case doesn't fit, or can't be shown to fit, under today's caps; callers answer 503 `SPEND_CAP_REACHED`. */
export class SpendCapReachedError extends Error {
  constructor(
    readonly feature: LlmFeature,
    readonly cap: keyof typeof CAP_MESSAGES,
    options?: { cause: unknown },
  ) {
    super(CAP_MESSAGES[cap](feature), options);
    this.name = 'SpendCapReachedError';
  }
}

const FAILURE_MESSAGES = {
  invalid_output: 'The model output failed schema validation on every attempt.',
  refused: 'The model refused the request.',
  provider_error: 'The model call failed.',
} satisfies Record<string, string>;

/** The model call failed or refused, or its output failed validation twice; callers answer 502 `GENERATION_FAILED`. */
export class GenerationFailedError extends Error {
  constructor(
    readonly reason: keyof typeof FAILURE_MESSAGES,
    options?: { cause: unknown },
  ) {
    super(FAILURE_MESSAGES[reason], options);
    this.name = 'GenerationFailedError';
  }
}
