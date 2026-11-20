import type { INestApplication } from '@nestjs/common';
import { FeedPageSchema, rankScore, topWindowStart } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const STORY_COUNT = 40_000;
// Retention keeps 90 days of stories, so the rankScore index also holds stories outside Top's window.
const OLDER_STORY_COUNT = 40_000;
// Stories 1..CLUSTERED_STORY_COUNT are paired into clusters: the odd one is the representative, the even one a hidden member.
const CLUSTERED_STORY_COUNT = 8_000;
const SAMPLES = 60;
// With clusters on, Top reads the (isPrimary, rankScore, id) index in place of the (rankScore, id) one.
const rankScoreIndexScan = {
  off: /Index Scan using "Story_rankScore_id_idx"/,
  on: /Index Scan using "Story_isPrimary_rankScore_id_idx"/,
};
// Set FEED_BENCH_EXPLAIN=1 to print each shape's EXPLAIN (ANALYZE, BUFFERS) plan.
const PRINT_PLANS = process.env.FEED_BENCH_EXPLAIN === '1';

const JsonPlanSchema = z.array(
  z.object({ 'QUERY PLAN': z.array(z.object({ Plan: z.object({ 'Total Cost': z.number() }) })) }),
);

describe('feed benchmark at 40k stories', () => {
  const prisma = useTestDatabase();
  // The same data is read with the clusters flag off (every story) and on (primary stories only).
  const apps = {} as Record<'off' | 'on', INestApplication>;
  let app: INestApplication;
  const shapesByFlag = {} as Record<'off' | 'on', Record<string, Record<string, string>>>;

  beforeAll(async () => {
    const source = await createSource(prisma, 'bench', 'hn');
    const total = STORY_COUNT + OLDER_STORY_COUNT;
    // An older story keeps the score of its last recompute, at 7 days old (Appendix B §6), so it ranks below the window.
    const now = new Date();
    const lowestPercentileScore = rankScore({
      percentile: 0,
      publishedAt: topWindowStart(now),
      now,
      sourceKinds: ['hn'],
    });
    await prisma.$executeRaw`
      INSERT INTO "Story" ("id", "canonicalUrl", "url", "domain", "title", "normalizedTitle",
        "publishedAt", "rankScore", "tags", "taggerVersion")
      SELECT 'bench' || n, 'https://example.com/' || n, 'https://example.com/' || n, 'example.com',
        'Benchmark ' || (ARRAY['bun','deno','node'])[1 + n % 3] || ' story ' || n,
        'benchmark story ' || n,
        CASE WHEN n <= ${STORY_COUNT} THEN now() - (n % 168) * interval '1 hour'
          ELSE now() - interval '8 days' - (n % (82 * 24)) * interval '1 hour' END,
        CASE WHEN n <= ${STORY_COUNT} THEN random() * 100
          ELSE ${lowestPercentileScore}::float8 * (1 + 99 * random()) END,
        ARRAY[(ARRAY['react','rust','go','python'])[1 + n % 4]], 1
      FROM generate_series(1, ${total}) AS n`;
    await prisma.$executeRaw`
      INSERT INTO "SourceItem" ("id", "storyId", "sourceId", "externalId", "url", "canonicalUrl", "title",
        "publishedAt", "lastSeenAt")
      SELECT 'item' || n, 'bench' || n, ${source.id}, n::text, 'https://example.com/' || n,
        'https://example.com/' || n,
        'Benchmark story ' || n, now(), now()
      FROM generate_series(1, ${total}) AS n`;
    // A second source on one story in ten, so a source boost or mute matches only a share of the feed.
    const minor = await createSource(prisma, 'bench-minor', 'devto');
    await prisma.$executeRaw`
      INSERT INTO "SourceItem" ("id", "storyId", "sourceId", "externalId", "url", "canonicalUrl", "title",
        "publishedAt", "lastSeenAt")
      SELECT 'minor' || n, 'bench' || n, ${minor.id}, n::text, 'https://example.com/' || n,
        'https://example.com/' || n,
        'Benchmark story ' || n, now(), now()
      FROM generate_series(10, ${total}, 10) AS n`;
    // A source with a handful of stories, so a filter on it matches fewer than a page.
    const tiny = await createSource(prisma, 'bench-tiny', 'rss');
    await prisma.$executeRaw`
      INSERT INTO "SourceItem" ("id", "storyId", "sourceId", "externalId", "url", "canonicalUrl", "title",
        "publishedAt", "lastSeenAt")
      SELECT 'tiny' || n, 'bench' || n, ${tiny.id}, n::text, 'https://example.com/' || n,
        'https://example.com/' || n,
        'Benchmark story ' || n, now(), now()
      FROM generate_series(1, 5) AS n`;
    // Production tables are analysed by autovacuum; without this the planner sees freshly bulk-loaded tables.
    await prisma.$executeRaw`
      INSERT INTO "Cluster" ("id", "representativeStoryId", "memberCount", "sourceKinds", "rankScore", "updatedAt")
      SELECT 'cluster' || n, 'bench' || n, 2, ARRAY['hn']::"SourceKind"[], 0, now()
      FROM generate_series(1, ${CLUSTERED_STORY_COUNT}, 2) AS n`;
    await prisma.$executeRaw`
      UPDATE "Story" SET "clusterId" = 'cluster' || (n - 1 + n % 2),
        "isPrimary" = n % 2 = 1
      FROM (SELECT "id", substring("id" from 6)::int AS n FROM "Story"
        WHERE substring("id" from 6)::int <= ${CLUSTERED_STORY_COUNT}) AS numbered
      WHERE "Story"."id" = numbered."id"`;
    await prisma.$executeRaw`ANALYZE "Story", "SourceItem", "Source", "Cluster"`;
    apps.off = await createTestApp([], { FEATURE_CLUSTERS: 'false' });
    apps.on = await createTestApp([], { FEATURE_CLUSTERS: 'true', ANTHROPIC_API_KEY: 'test-key' });
    const boosts = { boostTags: 'rust,go', boostSources: 'hn' };
    for (const flag of ['off', 'on'] as const) {
      app = apps[flag];
      const firstBoostedPage = await getFeed(boosts);
      shapesByFlag[flag] = shapesFor(
        boosts,
        FeedPageSchema.parse(firstBoostedPage.body).nextCursor,
      );
    }
  }, 180_000);

  function shapesFor(
    boosts: Record<string, string>,
    boostedCursor: string | null,
  ): Record<string, Record<string, string>> {
    return {
      'top + tags': { tags: 'react' },
      'search (q)': { q: 'bun story' },
      'latest + tags': { sort: 'latest', tags: 'rust' },
      'top + boost': boosts,
      'top + boost + mute': { ...boosts, excludeTags: 'python' },
      'top + boost, cursor page': {
        ...boosts,
        cursor: boostedCursor ?? '',
      },
      'top + boostSources (1 in 10 match)': { boostSources: 'bench-minor' },
      // One stream finds no story, so only the page floor stops its scan.
      'top + boost matching nothing': { boostTags: 'vue', boostSources: 'no-such-source' },
      'top + boost matching everything': { boostSources: 'bench' },
      // Fewer than a page match the filters, so the page floor finds no row to stop at.
      'top + small source + boostTags': { sources: 'bench-tiny', boostTags: 'rust' },
      'top + small source + boostSources': { sources: 'bench-tiny', boostSources: 'bench' },
      // A source filter that matches most stories, so the stream can stop early after a page.
      'top + large source + boost': { sources: 'bench', boostTags: 'rust' },
      'top + medium source (1 in 10) + boost': { sources: 'bench-minor', boostTags: 'rust' },
      'top + q matching nothing + boostTags': { q: 'zzqxnomatch', boostTags: 'rust' },
      'top + excludeSources (hides 9 in 10)': { excludeSources: 'bench' },
      // Unboosted source filters: a tiny and a minor source must not walk the whole rankScore index.
      'top + tiny source': { sources: 'bench-tiny' },
      'top + minor source (1 in 10)': { sources: 'bench-minor' },
      'top + large source': { sources: 'bench' },
      'latest + tiny source': { sort: 'latest', sources: 'bench-tiny' },
      'latest + minor source (1 in 10)': { sort: 'latest', sources: 'bench-minor' },
      'latest + large source': { sort: 'latest', sources: 'bench' },
    };
  }

  afterAll(async () => {
    await apps.off.close();
    await apps.on.close();
  });

  // The internal token skips the per-IP limit, which the samples would otherwise exhaust.
  const getFeed = (query: Record<string, string>) =>
    request(app.getHttpServer())
      .get('/api/v1/feed')
      .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '')
      .query(query);

  /** Captures the feed query (the raw read of Story) that a request runs. */
  async function captureFeedQuery(query: Record<string, string>) {
    const spy = vi.spyOn(app.get(PrismaService), '$queryRaw');
    app.get(LruCache).clear();
    await getFeed(query);
    const feedQuery = spy.mock.calls
      .map(([sql]) => sql)
      .find((sql) => sql instanceof Prisma.Sql && sql.sql.includes('"Story"'));
    spy.mockRestore();
    if (!(feedQuery instanceof Prisma.Sql)) throw new Error('no feed query reads "Story"');
    return feedQuery;
  }

  function explain(options: Prisma.Sql, feedQuery: Prisma.Sql) {
    return prisma.$queryRaw<unknown>(Prisma.sql`EXPLAIN ${options} ${feedQuery}`);
  }

  for (const flag of ['off', 'on'] as const) {
    it(`prints the feed p95 server time per query shape, clusters ${flag} (reported, not a gate)`, async () => {
      app = apps[flag];
      const shapes = shapesByFlag[flag];
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
          `feed p95 (${name}) at ${STORY_COUNT} stories (+${OLDER_STORY_COUNT} older): ${p95.toFixed(1)} ms (target <= 150 ms)`,
        );
      }
    }, 240_000);

    // Guards the boosted Top plan: its streams read the rankScore index, and no shape costs enough for JIT.
    // Plans follow the planner's estimates, so these assertions hold at this seed's size, not at every size.
    it(`reads boosted Top through the rankScore index, and plans no shape for JIT, clusters ${flag}`, async () => {
      app = apps[flag];
      const shapes = shapesByFlag[flag];
      const [{ jitAboveCost }] = await prisma.$queryRaw<[{ jitAboveCost: number }]>`
        SELECT current_setting('jit_above_cost')::float8 AS "jitAboveCost"`;
      for (const [name, query] of Object.entries(shapes)) {
        const feedQuery = await captureFeedQuery(query);
        const plan = z
          .array(z.object({ 'QUERY PLAN': z.string() }))
          .parse(await explain(Prisma.sql`(ANALYZE, BUFFERS)`, feedQuery))
          .map((row) => row['QUERY PLAN'])
          .join('\n');
        if (PRINT_PLANS) console.info(`QUERY PLAN (${name})\n${plan}`);
        // A selective filter (q, a small source) is better read through its own index or in one scan, not in rankScore order.
        if (query.boostTags || query.boostSources) {
          if (!query.q && !query.sources) {
            expect(plan, name).toMatch(rankScoreIndexScan[flag]);
          }
          expect(plan, name).not.toMatch(/Seq Scan on "Story"/);
        }
        // A tiny source is resolved to an id list, so its stories are looked up by key, not found by walking an index.
        if (name.endsWith('tiny source')) {
          expect(plan, name).not.toMatch(/Seq Scan on "Story"/);
          expect(plan, name).not.toMatch(
            /Index Scan (Backward )?using "Story_(isPrimary_)?(rankScore_id|publishedAt)\w*_idx"/,
          );
        }
        const [jsonPlan] = JsonPlanSchema.parse(
          await explain(Prisma.sql`(FORMAT JSON)`, feedQuery),
        );
        expect(jsonPlan?.['QUERY PLAN'][0]?.Plan['Total Cost'], name).toBeLessThan(jitAboveCost);
      }
    }, 60_000);
  }
});
