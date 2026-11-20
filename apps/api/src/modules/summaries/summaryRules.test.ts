import { describe, expect, it } from 'vitest';
import type { StorySummaryLlm } from '../llm/prompts/storySummary.v1.js';
import { autoCandidateIds, storedConsensus } from './summaryRules.js';

const consensus: NonNullable<StorySummaryLlm['consensus']> = {
  verdict: 'mixed',
  pros: ['Fast'],
  cons: ['Untested'],
};

describe('storedConsensus', () => {
  it('drops the consensus when fewer than 5 comments went into the prompt', () => {
    expect(storedConsensus(consensus, 4)).toBeNull();
    expect(storedConsensus(consensus, 0)).toBeNull();
  });

  it("keeps the model's consensus from 5 comments on, with the server's comment count", () => {
    expect(storedConsensus(consensus, 5)).toEqual({ ...consensus, basedOnComments: 5 });
    expect(storedConsensus(null, 40)).toBeNull();
  });
});

describe('autoCandidateIds', () => {
  it('keeps stories with at least 10 comments summed over their items, in the given order', () => {
    const stories = [
      { id: 'nine', items: [{ commentsCount: 5 }, { commentsCount: 4 }] },
      { id: 'ten', items: [{ commentsCount: 6 }, { commentsCount: 4 }, { commentsCount: null }] },
      { id: 'none', items: [{ commentsCount: null }] },
      { id: 'many', items: [{ commentsCount: 300 }] },
    ];

    expect(autoCandidateIds(stories)).toEqual(['ten', 'many']);
  });
});
