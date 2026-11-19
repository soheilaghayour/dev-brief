import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RSS_FIXTURE_NOW, readRssFixture } from '../../../../test/rssFixtures.js';
import { parseFeed } from './rssFeed.js';

const baseUrl = 'https://blog.example.com/feed.xml';
const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

describe('parseFeed', () => {
  it('keeps only items of the last 7 days from a recorded RSS 2.0 feed', async () => {
    const { items } = await parseFeed(readRssFixture('cloudflare-blog'), {
      baseUrl: 'https://blog.cloudflare.com/rss/',
      now: RSS_FIXTURE_NOW,
    });
    expect(items).toHaveLength(7);
    for (const item of items) {
      expect(RSS_FIXTURE_NOW.getTime() - item.publishedAt.getTime()).toBeLessThan(7 * 86_400_000);
    }
    expect(items[0]).toMatchObject({
      title: 'Internet traffic and attacks during the 2026 U.S. midterm elections',
      url: 'https://blog.cloudflare.com/internet-traffic-2026-us-election/',
      author: 'Patrick Day',
      sourceTags: expect.arrayContaining(['Security', 'DDoS']),
      points: null,
      commentsCount: null,
      reactionsCount: null,
      discussionUrl: null,
    });
  });

  it('returns nothing from a recorded feed whose newest item is older than 7 days', async () => {
    const { items } = await parseFeed(readRssFixture('react-blog'), {
      baseUrl: 'https://react.dev/rss.xml',
      now: RSS_FIXTURE_NOW,
    });
    expect(items).toEqual([]);
  });

  it('reads a recorded Atom feed and keeps at most 20 items, newest first', async () => {
    const { items } = await parseFeed(readRssFixture('simon-willison'), {
      baseUrl: 'https://simonwillison.net/atom/everything/',
      now: new Date('2026-11-17T00:00:00Z'), // at that moment nearly all of its 30 entries are younger than 7 days
    });
    expect(items).toHaveLength(20);
    const times = items.map((item) => item.publishedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(items[0]?.url).toMatch(/^https:\/\/simonwillison\.net\//);
    expect(items[0]?.excerpt).not.toMatch(/[<>]/);
  });

  it('keeps 20 of a feed with 25 recent items', async () => {
    const { items } = await parseFeed(readRssFixture('many-recent'), {
      baseUrl,
      now: RSS_FIXTURE_NOW,
    });
    expect(items).toHaveLength(20);
    expect(items[0]?.url).toBe('https://blog.example.com/posts/0');
  });

  it('skips items with a missing or unparseable date and counts them', async () => {
    const feed = await parseFeed(readRssFixture('edge-cases'), { baseUrl, now: RSS_FIXTURE_NOW });
    expect(feed.skippedWithoutDate).toBe(2);
    expect(feed.items.map((item) => item.url)).not.toContain(
      'https://blog.example.com/posts/missing-date',
    );
    expect(feed.items.map((item) => item.url)).not.toContain(
      'https://blog.example.com/posts/bad-date',
    );
  });

  it('uses sha1(guid ?? link) as the externalId', async () => {
    const { items } = await parseFeed(readRssFixture('edge-cases'), {
      baseUrl,
      now: RSS_FIXTURE_NOW,
    });
    const byUrl = new Map(items.map((item) => [item.url, item.externalId]));
    expect(byUrl.get('https://blog.example.com/posts/normal')).toBe(sha1('guid-normal'));
    expect(byUrl.get('https://blog.example.com/posts/no-guid')).toBe(
      sha1('https://blog.example.com/posts/no-guid'),
    );
  });

  it('resolves a relative link against the feed URL and strips HTML from titles', async () => {
    const { items } = await parseFeed(readRssFixture('edge-cases'), {
      baseUrl,
      now: RSS_FIXTURE_NOW,
    });
    const relative = items.find((item) => item.url.endsWith('/relative-link'));
    expect(relative).toMatchObject({
      url: 'https://blog.example.com/posts/relative-link',
      title: 'Bold title & more',
    });
  });

  it('drops an item without a link and counts it as invalid', async () => {
    const feed = await parseFeed(readRssFixture('edge-cases'), { baseUrl, now: RSS_FIXTURE_NOW });
    expect(feed.invalid).toBe(1);
    expect(feed.items).toHaveLength(4); // normal, no guid, relative link, long description
  });

  it('stores descriptions as plain text of at most 500 characters', async () => {
    const { items } = await parseFeed(readRssFixture('edge-cases'), {
      baseUrl,
      now: RSS_FIXTURE_NOW,
    });
    const normal = items.find((item) => item.url.endsWith('/normal'));
    expect(normal?.excerpt).toBe('Hello world & friends');
    const long = items.find((item) => item.url.endsWith('/long'));
    expect([...(long?.excerpt ?? '')]).toHaveLength(500);
    for (const item of items) expect(item.excerpt ?? '').not.toMatch(/[<>]/);
  });

  it('reads Atom categories as tags and <id> as the guid', async () => {
    const { items } = await parseFeed(readRssFixture('simon-willison'), {
      baseUrl: 'https://simonwillison.net/atom/everything/',
      now: RSS_FIXTURE_NOW,
    });
    expect(items[0]?.sourceTags.length).toBeGreaterThan(0);
    expect(items[0]?.externalId).toBe(sha1('https://simonwillison.net/2026/Nov/19/postgresql-19/'));
  });

  it('keeps the other entries of an Atom feed when one has a malformed date', async () => {
    const feed = await parseFeed(readRssFixture('atom-edge-cases'), {
      baseUrl,
      now: RSS_FIXTURE_NOW,
    });
    expect(feed.skippedWithoutDate).toBe(1);
    expect(feed.items.find((item) => item.url.endsWith('/valid'))).toMatchObject({
      sourceTags: ['Databases'],
      externalId: sha1('tag:blog.example.com,2026:valid'),
    });
  });

  it('clamps an item dated in the future to now', async () => {
    const { items } = await parseFeed(readRssFixture('atom-edge-cases'), {
      baseUrl,
      now: RSS_FIXTURE_NOW,
    });
    expect(items.find((item) => item.url.endsWith('/future'))?.publishedAt).toEqual(
      RSS_FIXTURE_NOW,
    );
  });

  it('keeps an item whose category and guid carry attributes', async () => {
    const feed = await parseFeed(readRssFixture('rss-attribute-edge-cases'), {
      baseUrl,
      now: RSS_FIXTURE_NOW,
    });
    expect(feed.invalid).toBe(0);
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({
      sourceTags: ['News'],
      externalId: sha1('https://blog.example.com/posts/attributed'),
    });
  });

  it('keeps text that only looks like markup in a title', async () => {
    const { items } = await parseFeed(
      '<rss version="2.0"><channel><title>t</title><item><title>Why a &lt; b and c &gt; d</title><link>https://blog.example.com/p</link><pubDate>Thu, 19 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>',
      { baseUrl, now: RSS_FIXTURE_NOW },
    );
    expect(items[0]?.title).toBe('Why a < b and c > d');
  });

  it('rejects a feed that is not well-formed XML', async () => {
    await expect(
      parseFeed(readRssFixture('broken'), { baseUrl, now: RSS_FIXTURE_NOW }),
    ).rejects.toThrow();
  });
});
