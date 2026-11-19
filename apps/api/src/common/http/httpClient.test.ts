import { describe, expect, it, vi } from 'vitest';
import { HttpClient, USER_AGENT, jitteredDelayMs, parseRetryAfterMs } from './httpClient.js';

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init);
}

function clientWith(fetchStub: typeof fetch, random = 0.5) {
  return new HttpClient(
    fetchStub,
    () => random,
    () => Date.parse('2026-01-01T00:00:00Z'),
  );
}

describe('parseRetryAfterMs', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfterMs('3', 0)).toBe(3000);
    expect(parseRetryAfterMs('Thu, 01 Jan 1970 00:00:10 GMT', 4000)).toBe(6000);
  });

  it('returns undefined when absent or malformed', () => {
    expect(parseRetryAfterMs(null, 0)).toBeUndefined();
    expect(parseRetryAfterMs('soon', 0)).toBeUndefined();
    expect(parseRetryAfterMs('1.5', 0)).toBeUndefined();
  });
});

describe('jitteredDelayMs', () => {
  it('spreads the wait between 0 and the step', () => {
    expect(jitteredDelayMs(1000, 0)).toBe(0);
    expect(jitteredDelayMs(1000, 0.5)).toBe(500);
  });
});

describe('HttpClient', () => {
  it('sends the bot User-Agent next to caller headers', async () => {
    const stub = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    await clientWith(stub).getJson('https://example.com/a', {
      timeoutMs: 1000,
      headers: { Accept: 'application/json' },
    });
    const init = stub.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({ 'User-Agent': USER_AGENT, Accept: 'application/json' });
  });

  it('retries a 5xx with jittered backoff and then succeeds', async () => {
    vi.useFakeTimers();
    try {
      const stub = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('', { status: 500 }))
        .mockResolvedValueOnce(new Response('', { status: 503 }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const pending = clientWith(stub).getJson('https://example.com/a', {
        timeoutMs: 1000,
        retryBackoffMs: [500, 1500],
      });
      // random = 0.5: waits of 250 ms and 750 ms
      await vi.advanceTimersByTimeAsync(250);
      expect(stub).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(750);
      await expect(pending).resolves.toEqual({ ok: true });
      expect(stub).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after the last retry', async () => {
    const stub = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    await expect(
      clientWith(stub, 0).getJson('https://example.com/a', {
        timeoutMs: 1000,
        retryBackoffMs: [5],
      }),
    ).rejects.toThrow('HTTP 500');
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 404', async () => {
    const stub = vi.fn<typeof fetch>(async () => new Response('', { status: 404 }));
    await expect(
      clientWith(stub).getJson('https://example.com/a', { timeoutMs: 1000, retryBackoffMs: [5] }),
    ).rejects.toThrow('HTTP 404');
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('waits for Retry-After instead of the backoff', async () => {
    vi.useFakeTimers();
    try {
      const stub = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '2' } }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      const pending = clientWith(stub).getJson('https://example.com/a', {
        timeoutMs: 1000,
        retryBackoffMs: [10],
      });
      await vi.advanceTimersByTimeAsync(1999);
      expect(stub).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toEqual({ ok: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails without waiting when Retry-After exceeds the cap', async () => {
    const stub = vi.fn<typeof fetch>(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }),
    );
    await expect(
      clientWith(stub).getJson('https://example.com/a', {
        timeoutMs: 1000,
        retryBackoffMs: [10],
        maxRetryAfterMs: 30_000,
      }),
    ).rejects.toThrow('HTTP 429');
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('aborts a request that exceeds the timeout', async () => {
    const stub = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    await expect(
      clientWith(stub).getJson('https://example.com/a', { timeoutMs: 20 }),
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('retries a network error', async () => {
    const stub = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    await expect(
      clientWith(stub, 0).getJson('https://example.com/a', {
        timeoutMs: 1000,
        retryBackoffMs: [5],
      }),
    ).resolves.toEqual({ ok: true });
  });

  it('rejects a body over the size cap, declared or streamed', async () => {
    const declared = vi.fn<typeof fetch>(
      async () => new Response('x', { headers: { 'content-length': '5000' } }),
    );
    await expect(
      clientWith(declared).get('https://example.com/a', { timeoutMs: 1000, maxResponseBytes: 100 }),
    ).rejects.toThrow('larger than 100');

    const streamed = vi.fn<typeof fetch>(async () => new Response('x'.repeat(500)));
    await expect(
      clientWith(streamed).get('https://example.com/a', { timeoutMs: 1000, maxResponseBytes: 100 }),
    ).rejects.toThrow('larger than 100');
  });

  it('treats a 304 as success without a body', async () => {
    const stub = vi.fn<typeof fetch>(async () => new Response(null, { status: 304 }));
    const response = await clientWith(stub).get('https://example.com/a', { timeoutMs: 1000 });
    expect(response).toMatchObject({ status: 304, text: '' });
  });

  it('stops retrying once the caller aborts', async () => {
    const controller = new AbortController();
    const stub = vi.fn<typeof fetch>(async () => {
      controller.abort(new Error('budget'));
      return new Response('', { status: 500 });
    });
    await expect(
      clientWith(stub).getJson('https://example.com/a', {
        timeoutMs: 1000,
        retryBackoffMs: [5, 5],
        signal: controller.signal,
      }),
    ).rejects.toThrow('HTTP 500');
    expect(stub).toHaveBeenCalledTimes(1);
  });
});
