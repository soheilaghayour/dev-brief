import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../common/http/httpClient.js';
import type { Source } from '../../../generated/prisma/client.js';
import {
  devtoFixtureFetch,
  fixtureOverlappingArticles,
  fixtureTopArticles,
} from '../../../../test/devtoFixtureFetch.js';
import { DEVTO_REQUEST_GAP_MS, DevtoAdapter } from './devto.adapter.js';

const source = { slug: 'devto', kind: 'devto' } as Source;
const signal = new AbortController().signal;

function adapterWith(
  fetchStub: typeof fetch,
  pause: (ms: number) => Promise<unknown> = async () => undefined,
) {
  // random = 0 makes retry backoff instant
  return { adapter: new DevtoAdapter(new HttpClient(fetchStub, () => 0), pause), pause };
}

afterEach(() => vi.useRealTimers());

describe('DevtoAdapter', () => {
  it('reads the recorded top and latest lists: 100 distinct articles', async () => {
    const { adapter } = adapterWith(devtoFixtureFetch());
    const items = await adapter.fetch(source, { signal });
    expect(items).toHaveLength(100);
    expect(new Set(items.map((item) => item.externalId)).size).toBe(100);
  });

  it('counts an id once when both lists contain it, and drops an invalid article', async () => {
    const latest = fixtureOverlappingArticles; // 2 repeated ids, 2 new, 1 invalid
    const { adapter } = adapterWith(devtoFixtureFetch({ latest }));
    const items = await adapter.fetch(source, { signal });
    expect(items).toHaveLength(fixtureTopArticles.length + 2);
  });

  it('AC-1.2.4 uses canonical_url as the item URL and the dev.to page as the discussion URL', async () => {
    const { adapter } = adapterWith(devtoFixtureFetch({ latest: fixtureOverlappingArticles }));
    const items = await adapter.fetch(source, { signal });
    expect(items.find((item) => item.externalId === '9000001')).toMatchObject({
      url: 'https://blog.cloudflare.com/internet-traffic-2026-us-election/?utm_source=devto',
      discussionUrl: 'https://dev.to/example/why-we-moved-our-rendering-to-the-edge-1abc',
    });
  });

  it('maps reactions, comments, tags, reading time, author and publish time', async () => {
    const { adapter } = adapterWith(devtoFixtureFetch());
    const [first] = await adapter.fetch(source, { signal });
    const recorded = fixtureTopArticles[0] as Record<string, unknown> & { user: { name: string } };
    expect(first).toMatchObject({
      externalId: String(recorded.id),
      points: null,
      reactionsCount: recorded.public_reactions_count,
      commentsCount: recorded.comments_count,
      sourceTags: recorded.tag_list,
      readingTimeMinutes: recorded.reading_time_minutes,
      author: recorded.user.name,
      publishedAt: new Date(String(recorded.published_at)),
    });
  });

  it('stores the description as plain text of at most 500 characters', async () => {
    const long = {
      ...(fixtureTopArticles[0] as object),
      description: `<p>${'word '.repeat(300)}<b>x</b></p>`,
    };
    const { adapter } = adapterWith(devtoFixtureFetch({ latest: [long] }));
    const [first] = await adapter.fetch(source, { signal });
    expect(first?.excerpt).not.toMatch(/<|>/);
    expect([...(first?.excerpt ?? '')].length).toBeLessThanOrEqual(500);
  });

  it('AC-1.2.11 sends the Forem v1 Accept header and the bot User-Agent, serially with a 2.5 s pause between requests', async () => {
    const events: string[] = [];
    const base = devtoFixtureFetch();
    const stub = vi.fn<typeof fetch>(async (input, init) => {
      events.push(`request ${new URL(String(input)).pathname}`);
      return base(input, init);
    });
    const pause = vi.fn(async (ms: number) => void events.push(`pause ${ms}`));
    await adapterWith(stub, pause).adapter.fetch(source, { signal });

    expect(events).toEqual([
      'request /api/articles',
      `pause ${DEVTO_REQUEST_GAP_MS}`,
      'request /api/articles/latest',
    ]);
    expect(DEVTO_REQUEST_GAP_MS).toBeGreaterThanOrEqual(2500);
    expect(String(stub.mock.calls[0]?.[0])).toBe('https://dev.to/api/articles?top=1&per_page=50');
    expect(String(stub.mock.calls[1]?.[0])).toBe('https://dev.to/api/articles/latest?per_page=50');
    for (const [, init] of stub.mock.calls) {
      expect(init?.headers).toMatchObject({
        Accept: 'application/vnd.forem.api-v1+json',
        'User-Agent': expect.stringContaining('DevBriefBot'),
      });
    }
  });

  it('honours a 429 Retry-After of 30 s and then succeeds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const base = devtoFixtureFetch();
    let first = true;
    const stub: typeof fetch = async (input, init) => {
      if (first) {
        first = false;
        return new Response('', { status: 429, headers: { 'Retry-After': '30' } });
      }
      return base(input, init);
    };
    const stub429 = vi.fn(stub);
    const result = adapterWith(stub429).adapter.fetch(source, { signal });

    await vi.advanceTimersByTimeAsync(29_999);
    expect(stub429).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toHaveLength(100);
    expect(stub429).toHaveBeenCalledTimes(3);
  });

  it('aborts the source on a 429 whose Retry-After is longer than 30 s, without retrying', async () => {
    const stub = vi.fn<typeof fetch>(
      async () => new Response('', { status: 429, headers: { 'Retry-After': '31' } }),
    );
    await expect(adapterWith(stub).adapter.fetch(source, { signal })).rejects.toThrow('HTTP 429');
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('aborts the source on a 429 without Retry-After, without retrying', async () => {
    const stub = vi.fn<typeof fetch>(async () => new Response('', { status: 429 }));
    await expect(adapterWith(stub).adapter.fetch(source, { signal })).rejects.toThrow('HTTP 429');
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('fails after the first request and its 2 retries answer HTTP 500, each retry at least 2.5 s after the last request', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const stub = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    const result = adapterWith(stub).adapter.fetch(source, { signal });
    const failed = expect(result).rejects.toThrow('HTTP 500');

    await vi.advanceTimersByTimeAsync(2499);
    expect(stub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(stub).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2499);
    expect(stub).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    expect(stub).toHaveBeenCalledTimes(3);
  });

  it('drops an article whose url is not http(s), and keeps one with an empty canonical_url or user name', async () => {
    const [article] = fixtureTopArticles as { url: string }[];
    const lists = [
      [
        { ...article, id: 1, url: 'javascript:alert(1)' },
        { ...article, id: 2, canonical_url: '', user: { name: '' } },
      ],
      [],
    ];
    let call = 0;
    const stub: typeof fetch = async () => Response.json(lists[call++]);
    const items = await adapterWith(stub).adapter.fetch(source, { signal });
    expect(items.map((item) => item.externalId)).toEqual(['2']);
    expect(items[0]).toMatchObject({ url: article?.url, author: null });
  });

  it('fails when a list is not an array', async () => {
    const stub: typeof fetch = async () => Response.json({ error: 'nope' });
    await expect(adapterWith(stub).adapter.fetch(source, { signal })).rejects.toThrow();
  });
});
