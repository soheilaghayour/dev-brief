import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../common/http/httpClient.js';
import type { Source } from '../../../generated/prisma/client.js';
import { RSS_FIXTURE_NOW, readRssFixture } from '../../../../test/rssFixtures.js';
import type { CacheValidators } from '../sourceAdapter.js';
import { RssAdapter } from './rss.adapter.js';

const signal = new AbortController().signal;

function feedSource(overrides: Partial<Source> = {}) {
  return {
    slug: 'rss-cloudflare-blog',
    kind: 'rss',
    feedUrl: 'https://blog.cloudflare.com/rss/',
    etag: null,
    lastModified: null,
    ...overrides,
  } as Source;
}

function adapterWith(fetchStub: typeof fetch) {
  // random = 0 makes retry backoff instant
  return new RssAdapter(new HttpClient(fetchStub, () => 0), () => RSS_FIXTURE_NOW);
}

function xmlResponse(xml: string, headers: Record<string, string> = {}) {
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml', ...headers } });
}

describe('RssAdapter', () => {
  it('AC-1.2.11 reads the recorded feed through a stubbed fetch: only items from the last 7 days', async () => {
    const stub = vi.fn<typeof fetch>(async () => xmlResponse(readRssFixture('cloudflare-blog')));
    const items = await adapterWith(stub).fetch(feedSource(), { signal });
    expect(items).toHaveLength(7);
    expect(String(stub.mock.calls[0]?.[0])).toBe('https://blog.cloudflare.com/rss/');
    expect(stub.mock.calls[0]?.[1]?.headers).toMatchObject({
      'User-Agent': expect.stringContaining('DevBriefBot'),
    });
  });

  it('sends the stored etag and lastModified, and a 304 is a success with 0 items', async () => {
    const stub = vi.fn<typeof fetch>(async () => new Response(null, { status: 304 }));
    const rememberValidators = vi.fn();
    const source = feedSource({
      etag: '"dba8beb3427ad09ec5437f71261d68f8"',
      lastModified: 'Wed, 18 Nov 2026 12:58:15 GMT',
    });

    const items = await adapterWith(stub).fetch(source, { signal, rememberValidators });

    expect(items).toEqual([]);
    expect(stub.mock.calls[0]?.[1]?.headers).toMatchObject({
      'If-None-Match': '"dba8beb3427ad09ec5437f71261d68f8"',
      'If-Modified-Since': 'Wed, 18 Nov 2026 12:58:15 GMT',
    });
    expect(rememberValidators).not.toHaveBeenCalled();
  });

  it('sends no conditional headers for a feed fetched for the first time', async () => {
    const stub = vi.fn<typeof fetch>(async () => xmlResponse(readRssFixture('edge-cases')));
    await adapterWith(stub).fetch(feedSource(), { signal });
    const headers = stub.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers).not.toHaveProperty('If-None-Match');
    expect(headers).not.toHaveProperty('If-Modified-Since');
  });

  it('hands the response etag and Last-Modified to the engine, and clears ones the feed stopped sending', async () => {
    const remembered: CacheValidators[] = [];
    const rememberValidators = (validators: CacheValidators) => void remembered.push(validators);
    const withHeaders = async () =>
      xmlResponse(readRssFixture('edge-cases'), {
        ETag: '"abc"',
        'Last-Modified': 'Wed, 18 Nov 2026 12:58:15 GMT',
      });
    const withoutHeaders = async () => xmlResponse(readRssFixture('edge-cases'));

    await adapterWith(withHeaders).fetch(feedSource(), { signal, rememberValidators });
    await adapterWith(withoutHeaders).fetch(feedSource({ etag: '"abc"' }), {
      signal,
      rememberValidators,
    });

    expect(remembered).toEqual([
      { etag: '"abc"', lastModified: 'Wed, 18 Nov 2026 12:58:15 GMT' },
      { etag: null, lastModified: null },
    ]);
  });

  it('fails on a feed that is not well-formed XML', async () => {
    const stub: typeof fetch = async () => xmlResponse(readRssFixture('broken'));
    await expect(adapterWith(stub).fetch(feedSource(), { signal })).rejects.toThrow();
  });

  it('retries once after an HTTP 500 and then fails', async () => {
    const stub = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    await expect(adapterWith(stub).fetch(feedSource(), { signal })).rejects.toThrow('HTTP 500');
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('fails on a body larger than 2 MB', async () => {
    const stub: typeof fetch = async () => xmlResponse(`<rss>${'x'.repeat(2 * 1024 * 1024)}</rss>`);
    await expect(adapterWith(stub).fetch(feedSource(), { signal })).rejects.toThrow('larger than');
  });

  it('fails a source without a feedUrl', async () => {
    const stub = vi.fn<typeof fetch>();
    await expect(
      adapterWith(stub).fetch(feedSource({ feedUrl: null }), { signal }),
    ).rejects.toThrow('no feedUrl');
    expect(stub).not.toHaveBeenCalled();
  });

  it('fetches at most 4 feeds at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const waiting: (() => void)[] = [];
    const stub: typeof fetch = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => waiting.push(resolve));
      inFlight--;
      return xmlResponse(readRssFixture('edge-cases'));
    };
    const adapter = adapterWith(stub);

    let finished = false;
    const feeds = Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        adapter.fetch(feedSource({ slug: `feed-${index}` }), { signal }),
      ),
    ).finally(() => (finished = true));
    while (!finished) {
      await new Promise((resolve) => setImmediate(resolve));
      waiting.splice(0).forEach((release) => release());
    }

    expect(await feeds).toHaveLength(11);
    expect(peak).toBe(4);
  });
});
