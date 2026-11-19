import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../common/http/httpClient.js';
import type { Source } from '../../../generated/prisma/client.js';
import { fixtureItems, hnFixtureFetch } from '../../../../test/hnFixtureFetch.js';
import { HnAdapter } from './hn.adapter.js';

const source = { slug: 'hn', kind: 'hn' } as Source;
const signal = new AbortController().signal;

function adapterWith(fetchStub: typeof fetch) {
  // random = 0 makes retry backoff instant
  return new HnAdapter(new HttpClient(fetchStub, () => 0));
}

describe('HnAdapter', () => {
  it('AC-1.2.3 keeps the 95 stories and drops the 3 jobs and 2 dead items of the recorded front page', async () => {
    const items = await adapterWith(hnFixtureFetch()).fetch(source, { signal });
    expect(items).toHaveLength(95);
    expect(new Set(items.map((item) => item.externalId)).size).toBe(95);
  });

  it('maps score, descendants, time and the HN item page', async () => {
    const [first] = await adapterWith(hnFixtureFetch()).fetch(source, { signal });
    const payload = fixtureItems[first?.externalId ?? ''];
    expect(first).toMatchObject({
      points: payload?.score,
      commentsCount: payload?.descendants,
      reactionsCount: null,
      publishedAt: new Date((payload?.time ?? 0) * 1000),
      discussionUrl: `https://news.ycombinator.com/item?id=${first?.externalId}`,
    });
  });

  it('gives a recorded story without a url the HN item URL', async () => {
    const items = await adapterWith(hnFixtureFetch()).fetch(source, { signal });
    const withoutUrl = items.filter((item) => fixtureItems[item.externalId]?.url === undefined);
    expect(withoutUrl).toHaveLength(3);
    for (const item of withoutUrl) {
      expect(item.url).toBe(item.discussionUrl);
      expect(item.url).toMatch(/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
    }
  });

  it('skips a deleted item shell that has no time instead of counting it as failed', async () => {
    const stub: typeof fetch = async (input) =>
      String(input).endsWith('/topstories.json')
        ? Response.json([1])
        : Response.json({ id: 1, type: 'story', deleted: true });
    expect(await adapterWith(stub).fetch(source, { signal })).toEqual([]);
  });

  it('AC-1.2.11 reads the recorded fixtures through a stubbed fetch: the first 100 ids, 101 requests, bot User-Agent', async () => {
    const stub = vi.fn(hnFixtureFetch({ extraIds: [1, 2, 3] }));
    await adapterWith(stub).fetch(source, { signal });
    expect(stub).toHaveBeenCalledTimes(101);
    const init = stub.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ 'User-Agent': expect.stringContaining('DevBriefBot') });
  });

  it('succeeds when fewer than 30% of item fetches fail', async () => {
    const items = await adapterWith(hnFixtureFetch({ failingItems: 29 })).fetch(source, {
      signal,
    });
    expect(items.length).toBeGreaterThanOrEqual(66);
  });

  it('fails when more than 30% of item fetches fail', async () => {
    await expect(
      adapterWith(hnFixtureFetch({ failingItems: 31 })).fetch(source, { signal }),
    ).rejects.toThrow('HN items failed');
  });

  it('fails when topstories fails', async () => {
    const stub: typeof fetch = async () => new Response('', { status: 500 });
    await expect(adapterWith(stub).fetch(source, { signal })).rejects.toThrow('HTTP 500');
  });

  it('drops an invalid item payload instead of crashing', async () => {
    const stub = hnFixtureFetch({ garbledItems: 2 });
    const items = await adapterWith(stub).fetch(source, { signal });
    expect(items).toHaveLength(93);
  });
});
