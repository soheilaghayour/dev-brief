import { describe, expect, it } from 'vitest';
import { IngestionPostRunSteps } from './postRunStep.js';

describe('IngestionPostRunSteps', () => {
  it('lists the rank recompute before auto summaries, whatever order they registered in', () => {
    const steps = new IngestionPostRunSteps();
    steps.register({ name: 'auto-summaries', run: async () => undefined });
    steps.register({ name: 'rank-recompute', run: async () => undefined });

    expect(steps.list().map((step) => step.name)).toEqual(['rank-recompute', 'auto-summaries']);
  });
});
