import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../../common/http/httpClient.js';
import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';
import type { StorySummaryLlm } from '../llm/prompts/storySummary.v1.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import {
  AUTO_ATTEMPTS_PER_RUN,
  autoCandidateIds,
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

describe('autoCandidateIds', () => {
  it('keeps stories with at least 10 comments summed over their items, in the given order', () => {
    const stories = [
      { id: 'nine', items: [{ commentsCount: 5 }, { commentsCount: 4 }] },
      { id: 'ten', items: [{ commentsCount: 6 }, { commentsCount: 4 }, { commentsCount: null }] },
      { id: 'none', items: [{ commentsCount: null }] },
      { id: 'many', items: [{ commentsCount: 300 }] },
    ];

    expect(autoCandidateIds(stories, new Set())).toEqual(['ten', 'many']);
  });

  it('leaves out the stories that failed today and stops at the per-run attempts', () => {
    const stories = Array.from({ length: AUTO_ATTEMPTS_PER_RUN + 5 }, (_, index) => ({
      id: `s${index}`,
      items: [{ commentsCount: 10 }],
    }));

    const ids = autoCandidateIds(stories, new Set(['s0', 's2']));

    expect(ids).toHaveLength(AUTO_ATTEMPTS_PER_RUN);
    expect(ids.slice(0, 3)).toEqual(['s1', 's3', 's4']);
  });
});

describe('inputFailureScope', () => {
  const http = (status?: number) => new HttpError('failed', { status });

  it("blames the story for a 404 or a payload it can't read", () => {
    expect(inputFailureScope(http(404))).toBe('story');
    // No status: invalid JSON or a body over the size cap.
    expect(inputFailureScope(http())).toBe('story');
    expect(inputFailureScope(z.object({ children: z.array(z.unknown()) }).safeParse({}).error)).toBe(
      'story',
    );
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
