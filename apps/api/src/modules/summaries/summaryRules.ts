import type { StorySummary } from '@devbrief/shared';
import { z } from 'zod';
import { HttpError } from '../../common/http/httpClient.js';
import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';
import type { StorySummaryLlm } from '../llm/prompts/storySummary.v1.js';
import { type InputFailureScope, SummaryInputsUnavailableError } from './summaries.errors.js';

/** PRD F2.3: a summary based on fewer comments has no consensus, whatever the model returned. */
export const MIN_CONSENSUS_COMMENTS = 5;

/** PRD F2.3: auto summaries stop once this many exist for the UTC day. */
export const AUTO_SUMMARIES_PER_DAY = 20;

/** PRD F2.3: only stories with at least this many comments, summed over their items, are summarised automatically. */
export const AUTO_MIN_COMMENTS = 10;

/** One run tries at most this many stories, failed ones included, so a run of Dev.to-only stories stays bounded too. */
export const AUTO_ATTEMPTS_PER_RUN = 25;

/** PRD §8.3: one run makes at most this many HN Algolia requests, one per HN item of every story it tries, failed tries included. */
export const AUTO_HN_REQUESTS_PER_RUN = 25;

/** The consensus to store: the model's, with the server's comment count, or null when too few comments went in. */
export function storedConsensus(
  consensus: StorySummaryLlm['consensus'],
  basedOnComments: number,
): StorySummary['consensus'] {
  if (consensus === null || basedOnComments < MIN_CONSENSUS_COMMENTS) return null;
  return { ...consensus, basedOnComments };
}

type CandidateStory = {
  id: string;
  /** Set with clusters on: a failed try of any member's representative blocks the whole cluster. */
  clusterId?: string | null;
  /** Every item of the story, or of all members of its cluster. */
  items: readonly { commentsCount: number | null; source?: { kind: string } }[];
};

export type AutoCandidate = { id: string; hnRequests: number };

/** The stories worth an auto summary, in the given order: discussed enough and not failed earlier today (`failedToday` holds cluster ids and the ids of single stories). */
export function autoCandidates(
  stories: readonly CandidateStory[],
  failedToday: ReadonlySet<string>,
): AutoCandidate[] {
  return stories.flatMap((story) => {
    if (failedToday.has(story.clusterId ?? story.id)) return [];
    const comments = story.items.reduce((sum, item) => sum + (item.commentsCount ?? 0), 0);
    if (comments < AUTO_MIN_COMMENTS) return [];
    const hnRequests = story.items.filter((item) => item.source?.kind === 'hn').length;
    return [{ id: story.id, hnRequests }];
  });
}

/** Whether a candidate still fits the run: within `AUTO_ATTEMPTS_PER_RUN` tries and `AUTO_HN_REQUESTS_PER_RUN` HN requests. */
export function fitsRunBudget(
  candidate: AutoCandidate,
  used: { attempts: number; hnRequests: number },
) {
  return (
    used.attempts < AUTO_ATTEMPTS_PER_RUN &&
    used.hnRequests + candidate.hnRequests <= AUTO_HN_REQUESTS_PER_RUN
  );
}

/** Whether a failed input fetch concerns only its story (a 404, a malformed payload) or its whole upstream (5xx, 429, timeout, lost connection, the run's budget). */
export function inputFailureScope(error: unknown): InputFailureScope {
  if (error instanceof z.ZodError) return 'story';
  if (error instanceof HttpError) {
    const { status } = error.options;
    // No status: the body was not JSON or exceeded the size cap.
    return status === undefined || status === 404 ? 'story' : 'upstream';
  }
  return 'upstream';
}

/** After a failed auto summary: `skip` to the next story, `stop` the step for this run, or `unexpected` for an error no rule covers. */
export function autoFailureAction(error: unknown): 'skip' | 'stop' | 'unexpected' {
  if (error instanceof SpendCapReachedError) return 'stop';
  // A provider error (revoked key, outage) would fail every following story too; bad output is this story's.
  if (error instanceof GenerationFailedError) {
    return error.reason === 'provider_error' ? 'stop' : 'skip';
  }
  if (error instanceof SummaryInputsUnavailableError) {
    return error.scope === 'upstream' ? 'stop' : 'skip';
  }
  return 'unexpected';
}
