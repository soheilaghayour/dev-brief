import type { INestApplication } from '@nestjs/common';
import { SourceListSchema, TAG_SLUGS, TAXONOMY_VERSION, TagListSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const DAY = 86_400_000;
const utcDay = (daysAgo: number) => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - daysAgo * DAY,
  );
};
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

describe('GET /api/v1/tags and /api/v1/sources', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;

  beforeAll(async () => {
    const stat = (day: Date, tag: string, storyCount: number) => ({
      day,
      tag,
      storyCount,
      engagementSum: 0,
      avgPercentile: 0.5,
    });
    await prisma.tagDailyStat.createMany({
      data: [
        stat(utcDay(0), 'react', 3),
        stat(utcDay(6), 'react', 4),
        stat(utcDay(7), 'react', 100),
        stat(utcDay(1), 'rust', 2),
      ],
    });
    const now = Date.now();
    await createSource(prisma, 'fresh', 'hn', { lastSuccessAt: new Date(now - 60_000) });
    await createSource(prisma, 'old', 'rss', { lastSuccessAt: new Date(now - 5 * 3_600_000) });
    await createSource(prisma, 'never', 'devto');
    await createSource(prisma, 'broken', 'github', {
      lastSuccessAt: new Date(now - 60_000),
      circuitOpenUntil: new Date(now + 3_600_000),
    });
    await createSource(prisma, 'disabled', 'rss', { enabled: false });
    app = await createTestApp();
  });

  afterAll(() => app.close());

  it('GET /tags lists every taxonomy tag in order with count7d over the last 7 UTC days', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/tags');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(PUBLIC_CACHE);
    const list = TagListSchema.parse(response.body);
    expect(list.version).toBe(TAXONOMY_VERSION);
    expect(list.tags.map((tag) => tag.slug)).toEqual([...TAG_SLUGS]);
    const counts = Object.fromEntries(list.tags.map((tag) => [tag.slug, tag.count7d]));
    expect(counts['react']).toBe(7);
    expect(counts['rust']).toBe(2);
    expect(counts['go']).toBe(0);
  });

  it('GET /sources lists enabled sources with healthy, stale and circuit_open status', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/sources');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(PUBLIC_CACHE);
    const { sources } = SourceListSchema.parse(response.body);
    const statusBySlug = Object.fromEntries(sources.map((source) => [source.slug, source.status]));
    expect(statusBySlug).toEqual({
      fresh: 'healthy',
      old: 'stale',
      never: 'stale',
      broken: 'circuit_open',
    });
    expect(sources.find((source) => source.slug === 'never')?.lastSuccessAt).toBeNull();
  });
});
