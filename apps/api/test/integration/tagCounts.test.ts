import type { INestApplication } from '@nestjs/common';
import { TagListSchema, TAG_SLUGS, TAXONOMY_VERSION } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { FeedCacheClearStep } from '../../src/modules/ranking/feedCacheClear.step.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { expectCountsMatchFeed, getTagCounts } from './tagCountsAgree.js';
import { useTestDatabase } from './testDatabase.js';

const HOUR = 3_600_000;
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';
const TITLES = ['Fast compiler news', 'Rewrite in Rust', 'Weekly digest', 'Compiler internals'];
const TAGS = ['react', 'typescript', 'rust', 'go', 'javascript', 'career'];

function at<T>(list: T[], index: number) {
  const value = list[index % list.length];
  if (value === undefined) throw new Error('empty list');
  return value;
}

// 40 stories over 280 hours, so Top's 7-day window drops the oldest; none has a TagDailyStat row.
describe('GET /api/v1/tags counts what the feed lists', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;

  beforeAll(async () => {
    const sources = [
      await createSource(prisma, 'hn', 'hn'),
      await createSource(prisma, 'devto', 'devto'),
      await createSource(prisma, 'blog', 'rss'),
    ];
    for (let index = 0; index < 40; index += 1) {
      const tags = new Set([at(TAGS, index), at(TAGS, index * 5 + 1)]);
      // A tag outside the taxonomy rides along on some stories and must never be listed.
      if (index % 7 === 0) tags.add('not-a-taxonomy-tag');
      const source = at(sources, index);
      const second = at(sources, index + 1);
      await createStory(prisma, {
        title: `${at(TITLES, index)} ${index}`,
        excerpt: index % 3 === 0 ? 'Covers the compiler and tooling' : undefined,
        publishedAt: new Date(Date.now() - index * 7 * HOUR),
        rankScore: index,
        tags: [...tags],
        itemSourceIds: index % 5 === 0 ? [source.id, second.id] : [source.id],
      });
    }
    app = await createTestApp();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    app.get(LruCache).clear();
  });

  it('AC-1.3.11 counts, for every tag, the stories Top lists with no other filter', async () => {
    const counts = await expectCountsMatchFeed(app);
    expect(counts['react']).toBeGreaterThan(0);
  });

  it('AC-1.3.11 counts the stories Latest lists, with no 7-day window', async () => {
    const latest = await expectCountsMatchFeed(app, { sort: 'latest' });
    const top = await getTagCounts(app);
    expect(latest['react']).toBeGreaterThan(top['react'] ?? 0);
  });

  it('AC-1.3.11 counts the stories a search with several pieces lists', async () => {
    await expectCountsMatchFeed(app, { q: 'compiler  FAST' });
    await expectCountsMatchFeed(app, { sort: 'latest', q: 'compiler tooling' });
  });

  it('AC-1.3.11 counts the stories a kinds filter lists', async () => {
    await expectCountsMatchFeed(app, { kinds: 'hn,rss' });
    await expectCountsMatchFeed(app, { sort: 'latest', kinds: 'devto' });
  });

  it('AC-1.3.11 counts the stories a sources filter lists', async () => {
    await expectCountsMatchFeed(app, { sources: 'blog' });
    await expectCountsMatchFeed(app, { sort: 'latest', sources: 'hn,devto' });
  });

  it('AC-1.3.11 counts the stories left after a muted source', async () => {
    const counts = await expectCountsMatchFeed(app, { excludeSources: 'blog' });
    expect(counts).not.toEqual(await getTagCounts(app));
  });

  it('AC-1.3.11 shows 0 for a muted tag, and fewer for the tags its stories carried', async () => {
    const unmuted = await getTagCounts(app, { sort: 'latest' });
    const counts = await expectCountsMatchFeed(app, { sort: 'latest', excludeTags: 'react' });
    expect(counts['react']).toBe(0);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBeLessThan(
      Object.values(unmuted).reduce((sum, count) => sum + count, 0),
    );
  });

  it('AC-1.3.11 counts right on a database with stories and no TagDailyStat rows (the sidebar showed 0 for every tag)', async () => {
    expect(await prisma.tagDailyStat.count()).toBe(0);
    const counts = await getTagCounts(app);
    expect(counts['react']).toBeGreaterThan(0);
  });

  it('AC-1.3.11 computes the same counts whatever tags, cursor, limit, boostTags and boostSources say', async () => {
    const ignored = {
      tags: 'react',
      cursor: 'not-a-cursor',
      limit: 3,
      boostTags: 'rust',
      boostSources: 'hn',
    };
    // The cache is cleared before each request, so both answers are computed, not shared.
    const withIgnored = await getTagCounts(app, { q: 'compiler', ...ignored });
    app.get(LruCache).clear();
    const plain = await getTagCounts(app, { q: 'compiler' });
    expect(withIgnored).toEqual(plain);
    expect(plain['typescript']).toBeGreaterThan(0);
  });

  it('AC-1.3.11 answers a request that differs only in the ignored parameters from one cache entry', async () => {
    const plain = await getTagCounts(app, { q: 'compiler' });
    await createStory(prisma, {
      title: 'Compiler arrives late',
      publishedAt: new Date(),
      tags: ['react'],
      itemSourceIds: [(await prisma.source.findFirstOrThrow()).id],
    });
    const withIgnored = await getTagCounts(app, {
      q: 'compiler',
      tags: 'react',
      limit: 3,
      boostTags: 'rust',
    });
    // The new story would raise react's count, so only the shared entry can give the old one.
    expect(withIgnored).toEqual(plain);
  });

  it('AC-1.3.11 rejects an invalid sort and a 101-character q with 400 VALIDATION_FAILED', async () => {
    for (const query of [{ sort: 'nonsense' }, { q: 'a'.repeat(101) }]) {
      const response = await request(app.getHttpServer())
        .get('/api/v1/tags')
        .query(query)
        .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('AC-1.3.11 returns every taxonomy tag in order, 0 for a tag with no story, and no tag outside the taxonomy', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/tags')
      .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '');
    const list = TagListSchema.parse(response.body);
    expect(list.version).toBe(TAXONOMY_VERSION);
    expect(list.tags.map((tag) => tag.slug)).toEqual([...TAG_SLUGS]);
    expect(list.tags.find((tag) => tag.slug === 'security')?.count).toBe(0);
    expect(list.tags.map((tag) => tag.slug)).not.toContain('not-a-taxonomy-tag');
  });

  it('AC-1.3.11 sends the public cache headers, serves a repeat from the cache, and an ingestion run clears it', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/tags')
      .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '');
    expect(first.headers['cache-control']).toBe(PUBLIC_CACHE);
    const before = TagListSchema.parse(first.body);

    await createStory(prisma, {
      title: 'A late story',
      publishedAt: new Date(),
      tags: ['security'],
      itemSourceIds: [(await prisma.source.findFirstOrThrow()).id],
    });
    const cached = await request(app.getHttpServer())
      .get('/api/v1/tags')
      .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '');
    expect(TagListSchema.parse(cached.body)).toEqual(before);

    await app.get(FeedCacheClearStep).run();
    const fresh = TagListSchema.parse(
      (
        await request(app.getHttpServer())
          .get('/api/v1/tags')
          .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '')
      ).body,
    );
    expect(fresh.tags.find((tag) => tag.slug === 'security')?.count).toBe(1);
  });
});
