import type { LlmFeature } from './budget.js';

/** A call's worst case doesn't fit under today's cap; callers answer 503 `SPEND_CAP_REACHED`. */
export class SpendCapReachedError extends Error {
  constructor(
    readonly feature: LlmFeature,
    readonly cap: 'feature' | 'global',
  ) {
    super(`The daily ${cap === 'global' ? 'global' : feature} LLM spend cap is reached.`);
    this.name = 'SpendCapReachedError';
  }
}

/** The model call failed or its output failed validation twice; callers answer 502 `GENERATION_FAILED`. */
export class GenerationFailedError extends Error {
  constructor(message: string, options?: { cause: unknown }) {
    super(message, options);
    this.name = 'GenerationFailedError';
  }
}
