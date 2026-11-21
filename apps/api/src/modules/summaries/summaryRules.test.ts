import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../../common/http/httpClient.js';
import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';
import type { StorySummaryLlm } from '../llm/prompts/storySummary.v1.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import {
  AUTO_ATTEMPTS_PER_RUN,
  AUTO_HN_REQUESTS_PER_RUN,
  autoCandidates,
  fitsRunBudget,
  autoFailureAction,
  inputFailureScope,
  storedConsensus,
} from './summaryRules.js';

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

describe('autoCandidates', () => {
  it('keeps stories with at least 10 comments summed over their items, in the given order', () => {
    const stories = [
      { id: 'nine', items: [{ commentsCount: 5 }, { commentsCount: 4 }] },
      { id: 'ten', items: [{ commentsCount: 6 }, { commentsCount: 4 }, { commentsCount: null }] },
      { id: 'none', items: [{ commentsCount: null }] },
      { id: 'many', items: [{ commentsCount: 300 }] },
    ];

    expect(autoCandidates(stories, new Set()).map(({ id }) => id)).toEqual(['ten', 'many']);
  });

  it('leaves out the stories that failed today', () => {
    const stories = ['s0', 's1', 's2'].map((id) => ({ id, items: [{ commentsCount: 10 }] }));

    expect(autoCandidates(stories, new Set(['s0', 's2'])).map(({ id }) => id)).toEqual(['s1']);
  });

  it('keys a failure by the cluster, so a representative that moved does not retry its cluster', () => {
    const items = [{ commentsCount: 10 }];
    const stories = [
      { id: 'newRep', clusterId: 'c1', items },
      { id: 'single', clusterId: null, items },
    ];

    expect(autoCandidates(stories, new Set(['c1'])).map(({ id }) => id)).toEqual(['single']);
  });

  it('counts the HN items of each candidate', () => {
    const hnItem = { commentsCount: 10, source: { kind: 'hn' } };
    const devtoItem = { commentsCount: 10, source: { kind: 'devto' } };

    expect(autoCandidates([{ id: 'a', items: [hnItem, devtoItem, hnItem] }], new Set())).toEqual([
      { id: 'a', hnRequests: 2 },
    ]);
  });
});

describe('fitsRunBudget', () => {
  it('stops at the per-run attempts', () => {
    const candidate = { id: 'a', hnRequests: 0 };

    expect(fitsRunBudget(candidate, { attempts: AUTO_ATTEMPTS_PER_RUN - 1, hnRequests: 0 })).toBe(
      true,
    );
    expect(fitsRunBudget(candidate, { attempts: AUTO_ATTEMPTS_PER_RUN, hnRequests: 0 })).toBe(
      false,
    );
  });

  it('F2.3 Clusters counts HN items, not stories, against the per-run Algolia budget', () => {
    const used = { attempts: 2, hnRequests: AUTO_HN_REQUESTS_PER_RUN - 5 };

    expect(fitsRunBudget({ id: 'c', hnRequests: 6 }, used)).toBe(false);
    expect(fitsRunBudget({ id: 'd', hnRequests: 5 }, used)).toBe(true);
    expect(
      fitsRunBudget(
        { id: 'devto', hnRequests: 0 },
        { attempts: 0, hnRequests: AUTO_HN_REQUESTS_PER_RUN },
      ),
    ).toBe(true);
  });
});

describe('inputFailureScope', () => {
  const http = (status?: number) => new HttpError('failed', { status });

  it("blames the story for a 404 or a payload it can't read", () => {
    expect(inputFailureScope(http(404))).toBe('story');
    // No status: invalid JSON or a body over the size cap.
    expect(inputFailureScope(http())).toBe('story');
    expect(
      inputFailureScope(z.object({ children: z.array(z.unknown()) }).safeParse({}).error),
    ).toBe('story');
  });

  it('blames the upstream for 5xx, 429, other 4xx, timeouts, lost connections and aborts', () => {
    for (const status of [500, 503, 429, 401, 403]) {
      expect(inputFailureScope(http(status))).toBe('upstream');
    }
    expect(inputFailureScope(new DOMException('timed out', 'TimeoutError'))).toBe('upstream');
    expect(inputFailureScope(new TypeError('fetch failed'))).toBe('upstream');
    expect(inputFailureScope(new Error('run budget spent'))).toBe('upstream');
  });
});

describe('autoFailureAction', () => {
  it('skips a story whose output was invalid or refused, or whose own inputs failed', () => {
    expect(autoFailureAction(new GenerationFailedError('invalid_output'))).toBe('skip');
    expect(autoFailureAction(new GenerationFailedError('refused'))).toBe('skip');
    expect(autoFailureAction(new SummaryInputsUnavailableError('s', 'story'))).toBe('skip');
  });

  it('stops the step on a spent cap, a provider error or a failing upstream', () => {
    expect(autoFailureAction(new SpendCapReachedError('summary_auto', 'feature'))).toBe('stop');
    expect(autoFailureAction(new GenerationFailedError('provider_error'))).toBe('stop');
    expect(autoFailureAction(new SummaryInputsUnavailableError('s', 'upstream'))).toBe('stop');
  });

  it('leaves any other error to the engine', () => {
    expect(autoFailureAction(new Error('database down'))).toBe('unexpected');
  });
});
