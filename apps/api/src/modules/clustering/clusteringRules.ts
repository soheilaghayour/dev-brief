import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';

/** The model calls one run may make, so the auto summaries keep their share of the run's 4-minute budget. */
export const CLUSTER_MAX_CALLS_PER_RUN = 100;

/** Unexpected errors in a row that end the step: one is a bad story, three are a broken database. */
export const CLUSTER_MAX_CONSECUTIVE_ERRORS = 3;

/** After a failed story: `skip` leaves S single and moves on, `stop` ends the step for this run, and `unexpected` is an error no rule covers, which counts as a skip until three come in a row. */
export function clusterFailureAction(error: unknown): 'skip' | 'stop' | 'unexpected' {
  if (error instanceof SpendCapReachedError) return 'stop';
  // A provider error (revoked key, outage) would fail every following story too; bad output is this story's.
  if (error instanceof GenerationFailedError) {
    return error.reason === 'provider_error' ? 'stop' : 'skip';
  }
  return 'unexpected';
}
