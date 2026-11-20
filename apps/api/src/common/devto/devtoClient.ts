import { Injectable } from '@nestjs/common';
import { HttpClient, sleep } from '../http/httpClient.js';

const DEVTO_API = 'https://dev.to/api';

// Unauthenticated clients are throttled: requests are serial and at least this far apart.
export const DEVTO_REQUEST_GAP_MS = 2500;

// PRD §8.3. A 429 is retried after its Retry-After up to 30 s; a longer one, or none, fails the request, and the caller aborts the source.
const DEVTO_REQUEST_OPTIONS = {
  timeoutMs: 8000,
  retryBackoffMs: [1000, 3000],
  maxRetryAfterMs: 30_000,
  minRetryDelayMs: DEVTO_REQUEST_GAP_MS,
  headers: { Accept: 'application/vnd.forem.api-v1+json' },
};

/** Every Dev.to request of the process: one serial queue, each request starting at least the gap after the previous one ended. */
@Injectable()
export class DevtoClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestEndedAt = -Infinity;

  constructor(
    private readonly http: HttpClient,
    private readonly pause: (ms: number, signal?: AbortSignal) => Promise<unknown> = sleep,
    private readonly nowMs: () => number = Date.now,
  ) {}

  /** GETs a Dev.to API path as JSON in the queue; throws when the request fails or `signal` aborts before it is sent. */
  getJson(path: string, signal?: AbortSignal): Promise<unknown> {
    const request = this.queue.then(() => this.send(path, signal));
    this.queue = request.catch(() => undefined);
    return request;
  }

  private async send(path: string, signal: AbortSignal | undefined) {
    const waitMs = this.lastRequestEndedAt + DEVTO_REQUEST_GAP_MS - this.nowMs();
    if (waitMs > 0) await this.pause(waitMs, signal);
    try {
      return await this.http.getJson(`${DEVTO_API}${path}`, { ...DEVTO_REQUEST_OPTIONS, signal });
    } finally {
      this.lastRequestEndedAt = this.nowMs();
    }
  }
}
