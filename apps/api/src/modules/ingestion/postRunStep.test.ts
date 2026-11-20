import { describe, expect, it } from 'vitest';
import { IngestionPostRunSteps } from './postRunStep.js';

describe('IngestionPostRunSteps', () => {
  it('lists clustering, then the rank recompute, then auto summaries, then the cache clear, whatever order they registered in', () => {
    const steps = new IngestionPostRunSteps();
    steps.register({ name: 'feed-cache-clear', run: async () => undefined });
    steps.register({ name: 'auto-summaries', run: async () => undefined });
    steps.register({ name: 'rank-recompute', run: async () => undefined });
    steps.register({ name: 'clustering', run: async () => undefined });

    expect(steps.list().map((step) => step.name)).toEqual([
      'clustering',
      'rank-recompute',
      'auto-summaries',
      'feed-cache-clear',
    ]);
  });
});
