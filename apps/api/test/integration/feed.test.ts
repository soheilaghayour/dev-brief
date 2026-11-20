import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, FeedPageSchema, type FeedPage } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
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
    // The personalisation params are plain feed filters: they work with the preferences flag off.
    app = await createTestApp([], { FEATURE_PREFERENCES: 'false' });
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
    expect((await getFeed({ excludeSources: `x'); DROP TABLE "Story"; --` })).status).toBe(200);
    expect((await getFeed({ boostSources: `x' OR '1'='1` })).status).toBe(200);
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

  describe('AC-2.5.2 personalisation params', () => {
    // Runs even when the test fails, so a failure doesn't leak stories into the shared seed.
    async function removeSourceAndStories(slug: string) {
      await prisma.story.deleteMany({ where: { items: { some: { source: { slug } } } } });
      await prisma.source.delete({ where: { slug } });
    }

    it('AC-2.5.2 excludeTags hides every story carrying a muted tag, in Top and Latest', async () => {
      const blog = await prisma.source.findUniqueOrThrow({ where: { slug: 'blog' } });
      await createStory(prisma, {
        title: 'Career ladders',
        publishedAt: hoursAgo(4),
        rankScore: 4,
        tags: ['career', 'go'],
        itemSourceIds: [blog.id],
      });
      expect(await feedTitles()).toContain('Career ladders');
      for (const sort of ['top', 'latest']) {
        const response = await getFeed({ sort, excludeTags: 'career' });
        const page = FeedPageSchema.parse(response.body);
        expect(page.items.length).toBeGreaterThan(0);
        expect(page.items.filter((item) => item.tags.includes('career'))).toEqual([]);
      }
      await prisma.story.deleteMany({ where: { title: 'Career ladders' } });
    });

    it('AC-2.5.2 excludeSources hides a story only when every one of its sources is muted', async () => {
      expect(await feedTitles({ excludeSources: 'hn' })).toEqual([
        'React compiler',
        'Rust and React',
        'Bun runtime news',
      ]);
      expect(await feedTitles({ excludeSources: 'hn,devto' })).toEqual(['Bun runtime news']);
    });

    it('AC-2.5.2 boostTags ranks a followed story at 0.7× its neighbour above it, and the cursor pages every story once', async () => {
      const blog = await prisma.source.findUniqueOrThrow({ where: { slug: 'blog' } });
      const extra = [
        { title: 'Neighbour', rank: 10, tags: ['go'] },
        { title: 'Rust borrow checker', rank: 7, tags: ['rust'] },
        // Boosted 6 × 1.5 = 9 ties TypeScript 7 (9) unboosted, so the id tiebreaker decides.
        { title: 'Rust async', rank: 6, tags: ['rust'] },
      ];
      for (const [index, story] of extra.entries()) {
        await createStory(prisma, {
          title: story.title,
          publishedAt: hoursAgo(5 + index),
          rankScore: story.rank,
          tags: story.tags,
          itemSourceIds: [blog.id],
        });
      }
      const unboosted = await feedTitles({ limit: 2 });
      expect(unboosted).toEqual(['Neighbour', 'TypeScript 7']);

      const boosted = await feedTitles({ boostTags: 'rust' });
      expect(boosted.slice(0, 2)).toEqual(['Rust borrow checker', 'Neighbour']);
      expect(boosted.slice(2, 4).sort()).toEqual(['Rust async', 'TypeScript 7']);
      expect(boosted.slice(4)).toEqual(['React compiler', 'Rust and React', 'Bun runtime news']);

      // A cursor on every row: one holding Rust borrow checker's raw 7, not 10.5, would skip three stories.
      const paged: string[] = [];
      let cursor: string | undefined;
      do {
        const response = await getFeed({
          boostTags: 'rust',
          limit: 1,
          ...(cursor ? { cursor } : {}),
        });
        const page = FeedPageSchema.parse(response.body);
        paged.push(...page.items.map((item) => item.title));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      expect(paged).toEqual(boosted);
      await prisma.story.deleteMany({
        where: { title: { in: extra.map((story) => story.title) } },
      });
    });

    it('AC-2.5.2 a muted tag does not hide a story with no tags', async () => {
      const source = await createSource(prisma, 'untagged', 'rss');
      onTestFinished(() => removeSourceAndStories('untagged'));
      const story = await createStory(prisma, {
        title: 'Untagged story',
        publishedAt: hoursAgo(6),
        rankScore: 2,
        itemSourceIds: [source.id],
      });
      // Prisma writes an empty list, but the column is nullable, and NULL tags match no tag.
      await prisma.$executeRaw`UPDATE "Story" SET "tags" = NULL WHERE "id" = ${story.id}`;
      const queries: Record<string, string>[] = [
        { sort: 'top', excludeTags: 'python' },
        { sort: 'latest', excludeTags: 'python' },
        { sort: 'top', excludeTags: 'python', boostTags: 'rust' },
      ];
      for (const query of queries) {
        expect(await feedTitles({ ...query, sources: 'untagged' })).toEqual(['Untagged story']);
      }
    });

    it('AC-2.5.2 a story matching a followed tag and a followed source is boosted once, not twice', async () => {
      // Stacked, React compiler would score 5 × 1.5 × 1.5 = 11.25 and pass TypeScript 7 (9).
      expect(await feedTitles({ boostTags: 'react', boostSources: 'devto' })).toEqual([
        'TypeScript 7',
        'React compiler',
        'Rust and React',
        'Bun runtime news',
      ]);
    });

    it('AC-2.5.2 a mute wins over a follow on the same story', async () => {
      expect(await feedTitles({ boostTags: 'rust', excludeTags: 'react' })).toEqual([
        'TypeScript 7',
        'Bun runtime news',
      ]);
      expect(await feedTitles({ boostSources: 'devto', excludeSources: 'devto' })).toEqual([
        'TypeScript 7',
        'React compiler',
        'Bun runtime news',
      ]);
    });

    it('AC-2.5.2 Latest ignores boosts', async () => {
      expect(await feedTitles({ sort: 'latest', boostTags: 'rust' })).toEqual(
        await feedTitles({ sort: 'latest' }),
      );
    });

    it('AC-2.5.2 personalised responses keep the public cache header, and reordered params share one cache entry', async () => {
      const prismaService = app.get(PrismaService);
      const spy = vi.spyOn(prismaService, '$queryRaw');
      const first = await getFeed({ excludeTags: 'career,go', boostSources: 'hn,devto' });
      const second = await getFeed({ boostSources: 'devto,hn', excludeTags: 'go,career' });
      for (const response of [first, second]) {
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe(
          'public, max-age=60, stale-while-revalidate=300',
        );
      }
      expect(second.body).toEqual(first.body);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('rejects an unknown tag in excludeTags or boostTags', async () => {
      const invalid: Record<string, string>[] = [
        { excludeTags: 'not-a-tag' },
        { boostTags: 'react,not-a-tag' },
      ];
      for (const params of invalid) {
        const response = await getFeed(params);
        expect(response.status).toBe(400);
        expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
      }
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
