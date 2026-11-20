/** A comment or article fetch for a summary failed, so nothing was generated; callers answer 503 `UPSTREAM_UNAVAILABLE`. */
export class SummaryInputsUnavailableError extends Error {
  constructor(
    readonly storyId: string,
    options?: { cause: unknown },
  ) {
    super(`The discussion of story ${storyId} could not be loaded.`, options);
    this.name = 'SummaryInputsUnavailableError';
  }
}
