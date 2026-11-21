import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../../common/http/httpClient.js';
import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';
import type { StorySummaryLlm } from '../llm/prompts/storySummary.v1.js';
import { SummaryInputsUnavailableError } from './summaries.errors.js';
import {
  AUTO_ATTEMPTS_PER_RUN,
  AUTO_HN_REQUESTS_PER_RUN,
  AUTO_SUMMARIES_PER_DAY,
  AUTO_SUMMARY_MIN_AGE_HOURS,
  SUMMARY_MIN_COMMENTS,
  autoCandidates,
  hasSummaryInput,
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

const NOW = new Date('2026-11-21T12:00:00.000Z');
const hoursAgo = (hours: number, minutes = 0) =>
  new Date(NOW.getTime() - (hours * 60 + minutes) * 60_000);
const hn = (commentsCount: number | null) => ({ commentsCount, source: { kind: 'hn' } });
const devto = (commentsCount: number | null) => ({ commentsCount, source: { kind: 'devto' } });
const rss = { commentsCount: null, source: { kind: 'rss' } };
const repo = { commentsCount: null, source: { kind: 'github' } };

describe('hasSummaryInput', () => {
  it('AC-2.3.12 is true for a Dev.to article with 0 comments', () => {
    expect(hasSummaryInput({ items: [devto(0)] })).toBe(true);
  });

  it('AC-2.3.12 is false for HN with 2 comments and true with 3', () => {
    expect(hasSummaryInput({ items: [hn(2)] })).toBe(false);
    expect(hasSummaryInput({ items: [hn(SUMMARY_MIN_COMMENTS)] })).toBe(true);
    expect(SUMMARY_MIN_COMMENTS).toBe(3);
  });

  it('AC-2.3.12 sums the comments over a cluster: 2 HN comments plus 1 more is true', () => {
    expect(hasSummaryInput({ items: [hn(1), hn(1), devto(1)] })).toBe(true);
    expect(hasSummaryInput({ items: [hn(1), hn(1)] })).toBe(false);
    expect(hasSummaryInput({ items: [hn(2), hn(1)] })).toBe(true);
  });

  it('AC-2.3.12 is false for a repo-only story and an RSS-only story with an excerpt', () => {
    expect(hasSummaryInput({ items: [repo] })).toBe(false);
    expect(hasSummaryInput({ items: [rss] })).toBe(false);
    expect(hasSummaryInput({ items: [rss, repo, hn(null)] })).toBe(false);
  });
});

describe('autoCandidates', () => {
  type Story = Parameters<typeof autoCandidates>[0][number];
  const story = (id: string, overrides: Partial<Story> = {}): Story => ({
    id,
    firstSeenAt: hoursAgo(5),
    items: [hn(10)],
    ...overrides,
  });
  const ids = (stories: Story[], failedToday = new Set<string>()) =>
    autoCandidates(stories, failedToday, NOW).map(({ id }) => id);

  it('AC-2.3.8 holds back 9 comments at 1 h 59 min and takes them at 2 h', () => {
    const items = [hn(9)];

    expect(ids([story('s', { items, firstSeenAt: hoursAgo(1, 59) })])).toEqual([]);
    expect(ids([story('s', { items, firstSeenAt: hoursAgo(AUTO_SUMMARY_MIN_AGE_HOURS) })])).toEqual(
      ['s'],
    );
  });

  it('AC-2.3.8 takes 10 comments at 5 minutes old', () => {
    expect(ids([story('s', { items: [hn(10)], firstSeenAt: hoursAgo(0, 5) })])).toEqual(['s']);
  });

  it('AC-2.3.8 never takes a repo-only story or an HN story with fewer than 3 comments, however old', () => {
    const stories = [
      story('repo', { items: [repo], firstSeenAt: hoursAgo(72) }),
      story('hnQuiet', { items: [hn(0)], firstSeenAt: hoursAgo(3) }),
      story('hnTwo', { items: [hn(2)], firstSeenAt: hoursAgo(3) }),
    ];

    expect(ids(stories)).toEqual([]);
  });

  it('AC-2.3.8 takes a Dev.to article with no comments once it is 2 h old, not before', () => {
    const items = [devto(0)];

    expect(ids([story('d', { items, firstSeenAt: hoursAgo(1) })])).toEqual([]);
    expect(ids([story('d', { items, firstSeenAt: hoursAgo(2) })])).toEqual(['d']);
  });

  it('AC-2.3.8 counts the comments of every cluster member', () => {
    const items = [hn(6), hn(4), devto(null)];

    expect(ids([story('c', { items, firstSeenAt: hoursAgo(0, 1) })])).toEqual(['c']);
  });

  it('keeps the given order', () => {
    expect(ids([story('b'), story('a'), story('c')])).toEqual(['b', 'a', 'c']);
  });

  it('leaves out the stories that failed today', () => {
    const stories = ['s0', 's1', 's2'].map((id) => story(id));

    expect(ids(stories, new Set(['s0', 's2']))).toEqual(['s1']);
  });

  it('keys a failure by the cluster, so a representative that moved does not retry its cluster', () => {
    const stories = [story('newRep', { clusterId: 'c1' }), story('single', { clusterId: null })];

    expect(ids(stories, new Set(['c1']))).toEqual(['single']);
  });

  it('counts the HN items of each candidate', () => {
    expect(
      autoCandidates([story('a', { items: [hn(10), devto(10), hn(10)] })], new Set(), NOW),
    ).toEqual([{ id: 'a', hnRequests: 2 }]);
  });

  it('AC-2.3.8 allows 500 auto summaries a day', () => {
    expect(AUTO_SUMMARIES_PER_DAY).toBe(500);
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
