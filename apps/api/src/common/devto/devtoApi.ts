export const DEVTO_API = 'https://dev.to/api';

// Unauthenticated clients are throttled: requests are serial and at least this far apart.
export const DEVTO_REQUEST_GAP_MS = 2500;

/** The timeout, retries, `Retry-After` cap and `Accept` header of every Dev.to request (PRD §8.3). */
export const DEVTO_REQUEST_OPTIONS = {
  timeoutMs: 8000,
  retryBackoffMs: [1000, 3000],
  maxRetryAfterMs: 30_000,
  minRetryDelayMs: DEVTO_REQUEST_GAP_MS,
  headers: { Accept: 'application/vnd.forem.api-v1+json' },
};
