import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const STORY_COUNT = 40_000;
const SAMPLES = 60;

describe('feed benchmark (reported, not a gate)', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;

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
      INSERT INTO "SourceItem" ("id", "storyId", "sourceId", "externalId", "url", "title", "publishedAt", "lastSeenAt")
      SELECT 'item' || n, 'bench' || n, ${source.id}, n::text, 'https://example.com/' || n,
        'Benchmark story ' || n, now(), now()
      FROM generate_series(1, ${STORY_COUNT}) AS n`;
    app = await createTestApp();
  }, 120_000);

  afterAll(() => app.close());

  it('prints the feed p95 server time per query shape at 40k stories', async () => {
    const cache = app.get(LruCache);
    const shapes = {
      'top + tags': { tags: 'react' },
      'search (q)': { q: 'bun story' },
      'latest + tags': { sort: 'latest', tags: 'rust' },
    };
    for (const [name, query] of Object.entries(shapes)) {
      const durations: number[] = [];
      for (let sample = 0; sample < SAMPLES; sample += 1) {
        cache.clear();
        const started = performance.now();
        const response = await request(app.getHttpServer()).get('/api/v1/feed').query(query);
        durations.push(performance.now() - started);
        expect(response.status).toBe(200);
      }
      durations.sort((a, b) => a - b);
      const p95 = durations[Math.floor(SAMPLES * 0.95) - 1] ?? 0;
      console.info(
        `feed p95 (${name}) at ${STORY_COUNT} stories: ${p95.toFixed(1)} ms (target <= 150 ms)`,
      );
    }
  }, 120_000);
});
