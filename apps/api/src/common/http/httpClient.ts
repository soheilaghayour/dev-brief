import { Injectable } from '@nestjs/common';

export const USER_AGENT = 'DevBriefBot/1.0 (+https://devbrief.dev)';

const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export interface HttpRequestOptions {
  timeoutMs: number;
  /** Upper bound of the wait before each retry; the number of entries is the number of retries. */
  retryBackoffMs?: readonly number[];
  /** A `Retry-After` longer than this is not waited for; the request fails instead, and so does a 429 without one. Unset: no cap. */
  maxRetryAfterMs?: number;
  /** Lower bound of every wait before a retry, `Retry-After` included. */
  minRetryDelayMs?: number;
  maxResponseBytes?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface HttpResponse {
  status: number;
  headers: Headers;
  text: string;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly options: { status?: number; retryable?: boolean; retryAfterMs?: number } = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Full jitter: a uniformly random wait between 0 and the backoff step. */
export function jitteredDelayMs(stepMs: number, random: number) {
  return Math.floor(stepMs * random);
}

/** Reads `Retry-After` (seconds or an HTTP date) as milliseconds from `nowMs`, or undefined when absent or malformed. */
export function parseRetryAfterMs(value: string | null, nowMs: number) {
  if (value === null) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  // RFC 9110 allows only integer seconds or an IMF-fixdate; Date.parse alone would read '1.5' as a year.
  if (!value.includes('GMT')) return undefined;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - nowMs);
}

// Network failures and timeouts reject with TypeError / TimeoutError; an HTTP error is retryable when marked so.
function isRetryable(error: unknown) {
  if (error instanceof HttpError) return error.options.retryable === true;
  return error instanceof Error && (error.name === 'TimeoutError' || error instanceof TypeError);
}

/** Resolves after `ms`, or rejects with the signal's reason once it aborts. */
export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function readCapped(response: Response, maxBytes: number) {
  const tooLarge = () => new HttpError(`Response larger than ${maxBytes} bytes`);
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Wraps `fetch` with a timeout, retries with full-jitter backoff, `Retry-After` handling, a size cap and the bot User-Agent. */
@Injectable()
export class HttpClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly random: () => number = Math.random,
    private readonly nowMs: () => number = Date.now,
  ) {}

  async get(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
    const backoff = options.retryBackoffMs ?? [];
    const maxRetryAfterMs = options.maxRetryAfterMs ?? Infinity;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.attempt(url, options);
      } catch (error) {
        const step = backoff[attempt];
        if (options.signal?.aborted || step === undefined || !isRetryable(error)) throw error;

        const retryAfterMs = error instanceof HttpError ? error.options.retryAfterMs : undefined;
        const throttled = error instanceof HttpError && error.options.status === 429;
        if (options.maxRetryAfterMs !== undefined && throttled && retryAfterMs === undefined) {
          throw error;
        }
        if (retryAfterMs !== undefined && retryAfterMs > maxRetryAfterMs) throw error;
        const waitMs = retryAfterMs ?? jitteredDelayMs(step, this.random());
        await sleep(Math.max(options.minRetryDelayMs ?? 0, waitMs), options.signal);
      }
    }
  }

  /** Fetches a URL and parses the body as JSON; the caller validates the shape. */
  async getJson(url: string, options: HttpRequestOptions): Promise<unknown> {
    const { text } = await this.get(url, options);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new HttpError(`Invalid JSON from ${url}`);
    }
  }

  private async attempt(url: string, options: HttpRequestOptions): Promise<HttpResponse> {
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const response = await this.fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, ...options.headers },
      signal,
    });
    // A 304 answers a conditional GET: success with no body.
    if (response.status === 304) return { status: 304, headers: response.headers, text: '' };
    if (!response.ok) {
      await response.body?.cancel();
      throw new HttpError(`HTTP ${response.status} from ${url}`, {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
        retryAfterMs: parseRetryAfterMs(response.headers.get('retry-after'), this.nowMs()),
      });
    }
    const text = await readCapped(response, options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES);
    return { status: response.status, headers: response.headers, text };
  }
}
