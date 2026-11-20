import { GenerationFailedError, SpendCapReachedError } from '../llm/llm.errors.js';

/** After a failed match call: `skip` leaves S single and moves on, `stop` ends the step for this run, `unexpected` is an error no rule covers. */
export function clusterFailureAction(error: unknown): 'skip' | 'stop' | 'unexpected' {
  if (error instanceof SpendCapReachedError) return 'stop';
  // A provider error (revoked key, outage) would fail every following story too; bad output is this story's.
  if (error instanceof GenerationFailedError) {
    return error.reason === 'provider_error' ? 'stop' : 'skip';
  }
  return 'unexpected';
}
