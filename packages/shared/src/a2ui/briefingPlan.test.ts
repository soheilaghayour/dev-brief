import { describe, expect, it } from 'vitest';
import { BriefingPlanSchema } from './briefingPlan.js';

const takeawaysSection = {
  kind: 'takeaways',
  items: [{ text: 'Native compiler preview dominated', storyIds: ['cbriefts0001'] }],
};
const tagsSection = { kind: 'tags', tags: ['typescript', 'javascript'] };
const plan = (sections: unknown[]) => ({ title: "This week's TypeScript debates", sections });

describe('BriefingPlanSchema', () => {
  it('accepts 2 to 6 sections', () => {
    expect(BriefingPlanSchema.safeParse(plan([takeawaysSection, tagsSection])).success).toBe(true);
    expect(BriefingPlanSchema.safeParse(plan(Array(6).fill(tagsSection))).success).toBe(true);
  });

  it('rejects a plan with 1 or 7 sections', () => {
    expect(BriefingPlanSchema.safeParse(plan([takeawaysSection])).success).toBe(false);
    expect(BriefingPlanSchema.safeParse(plan(Array(7).fill(tagsSection))).success).toBe(false);
  });

  it('rejects a tag outside the taxonomy', () => {
    const velocity = { kind: 'velocity', tags: ['cobol'], window: '7d', metric: 'stories' };
    expect(BriefingPlanSchema.safeParse(plan([takeawaysSection, velocity])).success).toBe(false);
  });

  it('rejects an unknown section kind', () => {
    const poll = { kind: 'poll', question: 'Biome or ESLint?' };
    expect(BriefingPlanSchema.safeParse(plan([takeawaysSection, poll])).success).toBe(false);
  });
});
