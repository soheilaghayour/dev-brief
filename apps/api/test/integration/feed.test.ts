import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, FeedPageSchema, type FeedPage } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const HOUR = 3_600_000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

describe('GET /api/v1/feed', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;

  async function getFeed(params: Record<string, string | number> = {}) {
    const response = await request(app.getHttpServer()).get('/api/v1/feed').query(params);
    return response;
  }
  async function feedTitles(params: Record<string, string | number> = {}) {
    const response = await getFeed(params);
    expect(response.status).toBe(200);
    return FeedPageSchema.parse(response.body).items.map((item) => item.title);
  }

  beforeAll(async () => {
    const hn = await createSource(prisma, 'hn', 'hn');
    const devto = await createSource(prisma, 'devto', 'devto');
    const blog = await createSource(prisma, 'blog', 'rss');
    const seeds = [
      { title: 'React compiler', hours: 2, rank: 5, tags: ['react'], sources: [hn.id, devto.id] },
      { title: 'TypeScript 7', hours: 30, rank: 9, tags: ['typescript'], sources: [hn.id] },
      {
        title: 'Bun runtime news',
        hours: 50,
        rank: 1,
        tags: ['javascript'],
        sources: [blog.id],
        excerpt: 'Fast javascript runtime',
      },
      {
        title: 'Rust and React',
        hours: 100,
        rank: 3,
        tags: ['rust', 'react'],
        sources: [devto.id],
      },
      { title: 'Old story', hours: 24 * 20, rank: 100, tags: ['react'], sources: [hn.id] },
    ];
    for (const seed of seeds) {
      await createStory(prisma, {
        title: seed.title,
        publishedAt: hoursAgo(seed.hours),
        rankScore: seed.rank,
        tags: seed.tags,
        excerpt: seed.excerpt,
        itemSourceIds: seed.sources,
      });
    }
    app = await createTestApp();
  });

  afterAll(() => app.close());

  // Each test sees the data it seeded, not a response cached by an earlier one.
  beforeEach(() => app.get(LruCache).clear());

  it('AC-1.3.1 returns the 7-day Top window ordered by rankScore desc with the public cache header', async () => {
    const response = await getFeed();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    const page: FeedPage = FeedPageSchema.parse(response.body);
    expect(page.items.map((item) => item.title)).toEqual([
      'TypeScript 7',
      'React compiler',
      'Rust and React',
      'Bun runtime news',
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('AC-1.3.1 maps one SourceRef per SourceItem, preferring the discussion URL', async () => {
    const response = await getFeed({ tags: 'react', limit: 1 });
    const [card] = FeedPageSchema.parse(response.body).items;
    expect(card?.title).toBe('React compiler');
    expect(card?.sources.map((source) => source.name).sort()).toEqual(['devto name', 'hn name']);
    expect(card?.sources[0]?.itemUrl).toBe('https://discuss.example.com/react-compiler');
  });

  it('AC-1.3.1 defaults to a page of 20', async () => {
    const hn = await prisma.source.findUniqueOrThrow({ where: { slug: 'hn' } });
    for (let index = 0; index < 22; index += 1) {
      await createStory(prisma, {
        title: `Filler ${index}`,
        publishedAt: hoursAgo(1),
        rankScore: 0,
        itemSourceIds: [hn.id],
      });
    }
    const response = await getFeed();
    const page = FeedPageSchema.parse(response.body);
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
    await prisma.story.deleteMany({ where: { title: { startsWith: 'Filler' } } });
  });

  it('AC-1.3.2 orders Latest by publishedAt desc with no time window', async () => {
    expect(await feedTitles({ sort: 'latest' })).toEqual([
      'React compiler',
      'TypeScript 7',
      'Bun runtime news',
      'Rust and React',
      'Old story',
    ]);
  });

  it('AC-1.3.3 matches tags with OR and combines facets with AND', async () => {
    expect(await feedTitles({ tags: 'typescript,rust' })).toEqual([
      'TypeScript 7',
      'Rust and React',
    ]);
    expect(await feedTitles({ tags: 'react', kinds: 'hn' })).toEqual(['React compiler']);
    expect(await feedTitles({ kinds: 'hn' })).toEqual(['TypeScript 7', 'React compiler']);
    expect(await feedTitles({ sources: 'blog' })).toEqual(['Bun runtime news']);
    expect(await feedTitles({ kinds: 'rss', sources: 'hn' })).toEqual([]);
  });

  it('AC-1.3.4 searches title and excerpt with websearch syntax, combined with filters and sort', async () => {
    expect(await feedTitles({ q: 'bun runtime' })).toEqual(['Bun runtime news']);
    expect(await feedTitles({ q: 'javascript' })).toEqual(['Bun runtime news']);
    expect(await feedTitles({ q: 'react', sort: 'latest' })).toEqual([
      'React compiler',
      'Rust and React',
    ]);
    expect(await feedTitles({ q: 'react', kinds: 'devto' })).toEqual([
      'React compiler',
      'Rust and React',
    ]);
  });

  it('AC-1.3.4 rejects q shorter than 2 or longer than 100 characters', async () => {
    for (const q of ['a', 'x'.repeat(101)]) {
      const response = await getFeed({ q });
      expect(response.status).toBe(400);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('rejects an unknown tag', async () => {
    const response = await getFeed({ tags: 'not-a-tag' });
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('treats hostile q input as data, never as SQL', async () => {
    for (const q of [`'; DROP TABLE "Story"; --`, `"unbalanced quote`, `a' OR '1'='1`]) {
      const response = await getFeed({ q });
      expect(response.status).toBe(200);
    }
    expect(await prisma.story.count()).toBe(5);
    expect((await getFeed({ sources: `x'); DROP TABLE "Story"; --` })).body.items).toEqual([]);
    expect(await prisma.story.count()).toBe(5);
  });

  describe('AC-1.3.5 keyset pagination', () => {
    async function pageThrough(sort: 'top' | 'latest') {
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const response = await getFeed({ sort, limit: 2, ...(cursor ? { cursor } : {}) });
        expect(response.status).toBe(200);
        const page = FeedPageSchema.parse(response.body);
        seen.push(...page.items.map((item) => item.id));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return seen;
    }

    it('AC-1.3.5 pages through every story once, including ties on rankScore and publishedAt', async () => {
      const hn = await prisma.source.findUniqueOrThrow({ where: { slug: 'hn' } });
      const tieTime = hoursAgo(3);
      for (const name of ['Tie A', 'Tie B', 'Tie C']) {
        await createStory(prisma, {
          title: name,
          publishedAt: tieTime,
          rankScore: 0.1 + 0.2, // 0.30000000000000004 pins the float8 cursor round trip
          itemSourceIds: [hn.id],
        });
      }
      for (const sort of ['top', 'latest'] as const) {
        const all = FeedPageSchema.parse((await getFeed({ sort, limit: 50 })).body).items.map(
          (item) => item.id,
        );
        expect(await pageThrough(sort)).toEqual(all);
      }
      await prisma.story.deleteMany({ where: { title: { startsWith: 'Tie' } } });
    });

    it('AC-1.3.5 answers 400 INVALID_CURSOR for a malformed cursor or one from another sort', async () => {
      const malformed = await getFeed({ cursor: 'not-a-cursor' });
      expect(malformed.status).toBe(400);
      expect(ApiErrorSchema.parse(malformed.body).error.code).toBe('INVALID_CURSOR');

      const topPage = await getFeed({ limit: 1 });
      const mismatched = await getFeed({ sort: 'latest', cursor: topPage.body.nextCursor });
      expect(mismatched.status).toBe(400);
      expect(ApiErrorSchema.parse(mismatched.body).error.code).toBe('INVALID_CURSOR');
    });
  });

  it('serves a repeated identical query from the cache without a second DB query, until cleared', async () => {
    const cache = app.get(LruCache);
    const prismaService = app.get(PrismaService);
    cache.clear();
    const spy = vi.spyOn(prismaService, '$queryRaw');
    await getFeed({ tags: 'react', limit: 5 });
    await getFeed({ limit: 5, tags: 'react' });
    expect(spy).toHaveBeenCalledTimes(1);
    cache.clear();
    await getFeed({ tags: 'react', limit: 5 });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
