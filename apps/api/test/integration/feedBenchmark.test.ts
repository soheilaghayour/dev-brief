import type { INestApplication } from '@nestjs/common';
import { FeedPageSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const STORY_COUNT = 40_000;
const SAMPLES = 60;
// Set FEED_BENCH_EXPLAIN=1 to print each shape's EXPLAIN (ANALYZE, BUFFERS) plan.
const PRINT_PLANS = process.env.FEED_BENCH_EXPLAIN === '1';

describe('feed benchmark at 40k stories', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;
  let shapes: Record<string, Record<string, string>>;

  beforeAll(async () => {
    const source = await createSource(prisma, 'bench', 'hn');
    await prisma.$executeRaw`
      INSERT INTO "Story" ("id", "canonicalUrl", "url", "domain", "title", "normalizedTitle",
        "publishedAt", "rankScore", "tags", "taggerVersion")
      SELECT 'bench' || n, 'https://example.com/' || n, 'https://example.com/' || n, 'example.com',
        'Benchmark ' || (ARRAY['bun','deno','node'])[1 + n % 3] || ' story ' || n,
        'benchmark story ' || n,
        now() - (n % 168) * interval '1 hour', random() * 100,
        ARRAY[(ARRAY['react','rust','go','python'])[1 + n % 4]], 1
      FROM generate_series(1, ${STORY_COUNT}) AS n`;
    await prisma.$executeRaw`
      INSERT INTO "SourceItem" ("id", "storyId", "sourceId", "externalId", "url", "canonicalUrl", "title",
        "publishedAt", "lastSeenAt")
      SELECT 'item' || n, 'bench' || n, ${source.id}, n::text, 'https://example.com/' || n,
        'https://example.com/' || n,
        'Benchmark story ' || n, now(), now()
      FROM generate_series(1, ${STORY_COUNT}) AS n`;
    // A second source on one story in ten, so a source boost or mute matches only a share of the feed.
    const minor = await createSource(prisma, 'bench-minor', 'devto');
    await prisma.$executeRaw`
      INSERT INTO "SourceItem" ("id", "storyId", "sourceId", "externalId", "url", "canonicalUrl", "title",
        "publishedAt", "lastSeenAt")
      SELECT 'minor' || n, 'bench' || n, ${minor.id}, n::text, 'https://example.com/' || n,
        'https://example.com/' || n,
        'Benchmark story ' || n, now(), now()
      FROM generate_series(10, ${STORY_COUNT}, 10) AS n`;
    // Production tables are analysed by autovacuum; without this the planner sees freshly bulk-loaded tables.
    await prisma.$executeRaw`ANALYZE "Story", "SourceItem", "Source"`;
    app = await createTestApp();
    const boosts = { boostTags: 'rust,go', boostSources: 'hn' };
    const firstBoostedPage = await getFeed(boosts);
    shapes = {
      'top + tags': { tags: 'react' },
      'search (q)': { q: 'bun story' },
      'latest + tags': { sort: 'latest', tags: 'rust' },
      'top + boost': boosts,
      'top + boost + mute': { ...boosts, excludeTags: 'python' },
      'top + boost, cursor page': {
        ...boosts,
        cursor: FeedPageSchema.parse(firstBoostedPage.body).nextCursor ?? '',
      },
      'top + boostSources (1 in 10 match)': { boostSources: 'bench-minor' },
      'top + excludeSources (hides 9 in 10)': { excludeSources: 'bench' },
    };
  }, 120_000);

  afterAll(() => app.close());

  // The internal token skips the per-IP limit, which the samples would otherwise exhaust.
  const getFeed = (query: Record<string, string>) =>
    request(app.getHttpServer())
      .get('/api/v1/feed')
      .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '')
      .query(query);

  /** Captures the feed query a request runs and returns its EXPLAIN (ANALYZE, BUFFERS) plan. */
  async function explainFeedQuery(query: Record<string, string>) {
    const spy = vi.spyOn(app.get(PrismaService), '$queryRaw');
    app.get(LruCache).clear();
    await getFeed(query);
    const [feedQuery] = spy.mock.calls[0] ?? [];
    spy.mockRestore();
    if (!(feedQuery instanceof Prisma.Sql)) throw new Error('the feed query is not a Prisma.Sql');
    const plan = await prisma.$queryRaw<{ 'QUERY PLAN': string }[]>(
      Prisma.sql`EXPLAIN (ANALYZE, BUFFERS) ${feedQuery}`,
    );
    return plan.map((row) => row['QUERY PLAN']).join('\n');
  }

  it('prints the feed p95 server time per query shape (reported, not a gate)', async () => {
    const cache = app.get(LruCache);
    for (const [name, query] of Object.entries(shapes)) {
      const durations: number[] = [];
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        cache.clear();
        const started = performance.now();
        const response = await getFeed(query);
        durations.push(performance.now() - started);
        expect(response.status).toBe(200);
      }
      durations.sort((a, b) => a - b);
      const p95 = durations[Math.floor(SAMPLES * 0.95) - 1] ?? 0;
      console.info(
        `feed p95 (${name}) at ${STORY_COUNT} stories: ${p95.toFixed(1)} ms (target <= 150 ms)`,
      );
    }
  }, 240_000);

  // A boosted sort over the whole window seq-scans Story, and its cost estimate turns on JIT compilation.
  it('reads every query shape through an index, without JIT', async () => {
    for (const [name, query] of Object.entries(shapes)) {
      const plan = await explainFeedQuery(query);
      if (PRINT_PLANS) console.info(`QUERY PLAN (${name})\n${plan}`);
      expect(plan, name).not.toMatch(/Seq Scan on "Story"|JIT:/);
    }
  });
});
