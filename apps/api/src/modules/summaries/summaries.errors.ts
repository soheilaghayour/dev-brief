/** `story`: only this story's inputs are missing or malformed; `upstream`: the source failed, so other stories' fetches would fail too. */
export type InputFailureScope = 'story' | 'upstream';

/** A comment or article fetch for a summary failed, so nothing was generated; callers answer 503 `UPSTREAM_UNAVAILABLE`. */
export class SummaryInputsUnavailableError extends Error {
  constructor(
    readonly storyId: string,
    readonly scope: InputFailureScope,
    options?: { cause: unknown },
  ) {
    super(`The discussion of story ${storyId} could not be loaded.`, options);
    this.name = 'SummaryInputsUnavailableError';
  }
}
