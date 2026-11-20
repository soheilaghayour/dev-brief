import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/common/http/httpClient.js';
import { EnvModule } from '../../src/common/env/env.module.js';
import { PrismaModule } from '../../src/common/prisma/prisma.module.js';
import { DevtoClient } from '../../src/common/devto/devtoClient.js';
import { DevtoAdapter } from '../../src/modules/ingestion/adapters/devto.adapter.js';
import { HnAdapter } from '../../src/modules/ingestion/adapters/hn.adapter.js';
import { RssAdapter } from '../../src/modules/ingestion/adapters/rss.adapter.js';
import { IngestionModule } from '../../src/modules/ingestion/ingestion.module.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { SOURCE_ADAPTERS } from '../../src/modules/ingestion/sourceAdapter.js';
import { devtoFixtureFetch, fixtureOverlappingArticles } from '../devtoFixtureFetch.js';
import { hnFixtureFetch } from '../hnFixtureFetch.js';
import { RSS_FIXTURE_NOW, readRssFixture } from '../rssFixtures.js';
import { useTestDatabase } from './testDatabase.js';

const CLOUDFLARE_FEED_URL = 'https://blog.cloudflare.com/rss/';
const DEVTO_FIRST_REQUEST = 'https://dev.to/api/articles?top=1&per_page=50';

// Recorded Cloudflare feed: 7 items from the last 7 days. Dev.to with the overlapping list: 52 articles,
// one of them a cross-post of the newest Cloudflare item, so both together make 58 Stories.
const RSS_ITEMS = 7;
const DEVTO_ITEMS = 52;

function feedFetch({
  etag,
  onRequest,
}: {
  etag?: string;
  onRequest?: (init?: RequestInit) => void;
}) {
  const stub: typeof fetch = async (_input, init) => {
    onRequest?.(init);
    const headers = new Headers(init?.headers);
    if (etag && headers.get('If-None-Match') === etag) return new Response(null, { status: 304 });
    return new Response(readRssFixture('cloudflare-blog'), {
      headers: etag ? { ETag: etag, 'Last-Modified': 'Thu, 19 Nov 2026 14:00:00 GMT' } : {},
    });
  };
  return stub;
}

describe('ingestion of Dev.to and RSS', () => {
  const prisma = useTestDatabase();
  let close: () => Promise<void>;

  function rssAdapter(fetchStub: typeof fetch = feedFetch({})) {
    return new RssAdapter(new HttpClient(fetchStub, () => 0), () => RSS_FIXTURE_NOW);
  }

  function devtoAdapter(
    fetchStub: typeof fetch = devtoFixtureFetch({ latest: fixtureOverlappingArticles }),
  ) {
    return new DevtoAdapter(
      new DevtoClient(new HttpClient(fetchStub, () => 0), async () => undefined),
    );
  }

  async function createService(adapters: (HnAdapter | DevtoAdapter | RssAdapter)[]) {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, PrismaModule, IngestionModule],
    })
      .overrideProvider(SOURCE_ADAPTERS)
      .useValue(adapters)
      .compile();
    close = () => moduleRef.close();
    return moduleRef.get(IngestionService);
  }

  async function createSources(...slugs: ('hn' | 'devto' | 'rss')[]) {
    for (const slug of slugs) {
      await prisma.source.create({
        data:
          slug === 'rss'
            ? {
                slug: 'rss-cloudflare-blog',
                kind: 'rss',
                name: 'Cloudflare Blog',
                siteUrl: 'https://blog.cloudflare.com',
                feedUrl: CLOUDFLARE_FEED_URL,
              }
            : { slug, kind: slug, name: slug, siteUrl: `https://${slug}.test` },
      });
    }
  }

  beforeEach(() =>
    prisma.$executeRawUnsafe(
      'TRUNCATE "IngestionRun", "SourceItem", "Story", "Source" RESTART IDENTITY CASCADE',
    ),
  );
  afterEach(() => close());

  it('ingests the recorded Dev.to lists: 100 SourceItems and 100 Stories with the mapped fields', async () => {
    await createSources('devto');
    const service = await createService([devtoAdapter(devtoFixtureFetch())]);

    const { status } = await service.run();

    expect(status).toBe('success');
    expect(await prisma.sourceItem.count()).toBe(100);
    expect(await prisma.story.count()).toBe(100);
    const item = await prisma.sourceItem.findFirstOrThrow({ orderBy: { reactionsCount: 'desc' } });
    expect(item.engagement).toBe((item.reactionsCount ?? 0) + (item.commentsCount ?? 0));
    expect(item.discussionUrl).toMatch(/^https:\/\/dev\.to\//);
  });

  it('counts an article that both Dev.to lists contain once', async () => {
    await createSources('devto');
    const service = await createService([devtoAdapter()]);

    await service.run();

    expect(await prisma.sourceItem.count()).toBe(DEVTO_ITEMS);
    expect(await prisma.story.count()).toBe(DEVTO_ITEMS);
  });

  it('ingests the recorded RSS feed: only items of the last 7 days, externalId = sha1', async () => {
    await createSources('rss');
    const service = await createService([rssAdapter()]);

    const { status } = await service.run();

    expect(status).toBe('success');
    const items = await prisma.sourceItem.findMany();
    expect(items).toHaveLength(RSS_ITEMS);
    for (const item of items) expect(item.externalId).toMatch(/^[0-9a-f]{40}$/);
    const story = await prisma.story.findFirstOrThrow({ orderBy: { publishedAt: 'desc' } });
    expect(story.excerpt).not.toMatch(/<|>/);
    expect([...(story.excerpt ?? '')].length).toBeLessThanOrEqual(500);
  });

  it.each([
    ['Dev.to first', 'devto', 'rss-cloudflare-blog'],
    ['RSS first', 'rss-cloudflare-blog', 'devto'],
  ])(
    'AC-1.2.4 joins a Dev.to cross-post and its original RSS item into one Story with two SourceItems (%s)',
    async (_order, firstSlug, secondSlug) => {
      await createSources('devto', 'rss');
      const service = await createService([devtoAdapter(), rssAdapter()]);

      for (const slug of [firstSlug, secondSlug]) {
        await prisma.source.updateMany({ data: { enabled: false } });
        await prisma.source.update({ where: { slug }, data: { enabled: true } });
        await service.run();
      }

      expect(await prisma.sourceItem.count()).toBe(DEVTO_ITEMS + RSS_ITEMS);
      expect(await prisma.story.count()).toBe(DEVTO_ITEMS + RSS_ITEMS - 1);
      const story = await prisma.story.findUniqueOrThrow({
        where: { canonicalUrl: 'https://blog.cloudflare.com/internet-traffic-2026-us-election' },
        include: { items: { include: { source: true } } },
      });
      expect(story.items.map((item) => item.source.slug).sort()).toEqual([
        'devto',
        'rss-cloudflare-blog',
      ]);
    },
  );

  it('AC-1.2.7 completes HN and RSS when Dev.to fails every attempt, marking the run partial', async () => {
    await createSources('hn', 'devto', 'rss');
    const devtoDown = devtoAdapter(async () => new Response('', { status: 500 }));
    const service = await createService([
      new HnAdapter(new HttpClient(hnFixtureFetch(), () => 0)),
      devtoDown,
      rssAdapter(),
    ]);

    const { runId, status } = await service.run();

    expect(status).toBe('partial');
    expect(await prisma.sourceItem.count()).toBe(95 + RSS_ITEMS);
    const runs = await prisma.ingestionRun.findMany({
      where: { runId, sourceId: { not: null } },
      include: { source: true },
    });
    expect(runs).toHaveLength(3);
    expect(runs.find((run) => run.source?.slug === 'devto')).toMatchObject({
      status: 'failed',
      error: `HTTP 500 from ${DEVTO_FIRST_REQUEST}`,
    });
    expect(runs.find((run) => run.source?.slug === 'hn')?.status).toBe('success');
    expect(runs.find((run) => run.source?.slug === 'rss-cloudflare-blog')?.status).toBe('success');
    expect(await prisma.source.findUniqueOrThrow({ where: { slug: 'devto' } })).toMatchObject({
      consecutiveFailures: 1,
      lastError: `HTTP 500 from ${DEVTO_FIRST_REQUEST}`,
    });
  }, 20_000); // Dev.to's two retries wait at least 2.5 s each

  it('stores the feed etag and lastModified, re-sends them, and counts a 304 as a success with 0 items', async () => {
    await createSources('rss');
    const requests: Headers[] = [];
    const service = await createService([
      rssAdapter(
        feedFetch({ etag: '"v1"', onRequest: (init) => requests.push(new Headers(init?.headers)) }),
      ),
    ]);

    await service.run();
    const stored = await prisma.source.findUniqueOrThrow({
      where: { slug: 'rss-cloudflare-blog' },
    });
    expect(stored).toMatchObject({
      etag: '"v1"',
      lastModified: 'Thu, 19 Nov 2026 14:00:00 GMT',
    });

    const second = await service.run();

    expect(requests[1]?.get('If-None-Match')).toBe('"v1"');
    expect(requests[1]?.get('If-Modified-Since')).toBe('Thu, 19 Nov 2026 14:00:00 GMT');
    expect(second.status).toBe('success');
    const secondRun = await prisma.ingestionRun.findFirstOrThrow({
      where: { runId: second.runId, sourceId: { not: null } },
    });
    expect(secondRun).toMatchObject({ status: 'success', itemsFetched: 0, itemsCreated: 0 });
    expect(await prisma.sourceItem.count()).toBe(RSS_ITEMS);
    const after = await prisma.source.findUniqueOrThrow({ where: { slug: 'rss-cloudflare-blog' } });
    expect(after.etag).toBe('"v1"');
    expect(after.consecutiveFailures).toBe(0);
  });
});
