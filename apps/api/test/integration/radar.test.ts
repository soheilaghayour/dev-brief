import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, RadarSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FeedCacheClearStep } from '../../src/modules/ranking/feedCacheClear.step.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

// One fixed clock for the seed, the expectations and the server, so the suite can't flake across UTC midnight.
const NOW = new Date('2026-07-01T12:00:00Z');
const DAY_MS = 86_400_000;
const utcDay = (daysAgo: number) =>
  new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()) - daysAgo * DAY_MS);
const isoDay = (daysAgo: number) => utcDay(daysAgo).toISOString().slice(0, 10);
const stat = (daysAgo: number, tag: string, storyCount: number, engagementSum = 0) => ({
  day: utcDay(daysAgo),
  tag,
  storyCount,
  engagementSum,
  avgPercentile: 0.5,
});

describe('GET /api/v1/radar', () => {
  const prisma = useTestDatabase();
  let on: INestApplication;

  const get = (path: string, app = on) => request(app.getHttpServer()).get(`/api/v1/radar${path}`);

  beforeAll(async () => {
    // Only Date is faked: timers and I/O keep running for the HTTP server and the database.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    // The windows end on yesterday (daysAgo 1), so today's row (daysAgo 0) must count for nothing.
    await prisma.tagDailyStat.createMany({
      data: [
        stat(0, 'rust', 50, 5000),
        stat(1, 'rust', 3, 300),
        stat(3, 'rust', 4, 100),
        // Days 2, 4, 5, 6 and 7 have no row: they must come back as 0.
        stat(9, 'rust', 1, 10),
        stat(1, 'vue', 1, 5),
        stat(11, 'vue', 6, 60),
        stat(30, 'go', 2, 20),
      ],
    });
    // A story with tags but no TagDailyStat row: the radar must not read stories.
    const hn = await createSource(prisma, 'hn', 'hn');
    await createStory(prisma, {
      title: 'Python story',
      publishedAt: new Date(),
      tags: ['python'],
      itemSourceIds: [hn.id],
    });
    // Radar has no flag.
    on = await createTestApp();
  });

  afterAll(async () => {
    vi.useRealTimers();
    await on.close();
  });

  it('AC-3.3.2 parses with RadarSchema, carries the public cache headers and defaults to 7d stories', async () => {
    const response = await get('');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    const radar = RadarSchema.parse(response.body);
    expect(radar).toMatchObject({ window: '7d', metric: 'stories' });
  });

  it('AC-3.3.2 ends the series on yesterday and gives 0-valued points on days without stats', async () => {
    const radar = RadarSchema.parse((await get('?tags=rust')).body);
    const points = radar.series[0]?.points ?? [];
    expect(points).toHaveLength(7);
    expect(points.map(({ date }) => date)).not.toContain(isoDay(0));
    expect(points.map(({ date }) => date)).toEqual([7, 6, 5, 4, 3, 2, 1].map(isoDay));
    expect(points.map(({ value }) => value)).toEqual([0, 0, 0, 0, 4, 0, 3]);
  });

  it('AC-3.3.2 returns 30 points for a 30d window and counts the engagement metric', async () => {
    const radar = RadarSchema.parse((await get('?window=30d&metric=engagement&tags=go')).body);
    expect(radar.series[0]?.points).toHaveLength(30);
    expect(radar.series[0]?.points[0]).toEqual({ date: isoDay(30), value: 20 });
    expect(radar.movers.find((mover) => mover.tag === 'vue')).toMatchObject({
      current: 65,
      previous: 0,
      deltaPct: null,
    });
  });

  it('AC-3.3.2 reads only TagDailyStat: a tagged story without rows adds nothing', async () => {
    const radar = RadarSchema.parse((await get('?window=30d')).body);
    expect(radar.movers.map(({ tag }) => tag)).not.toContain('python');
    const python = RadarSchema.parse((await get('?window=30d&tags=python')).body);
    expect(python.series[0]?.points.every(({ value }) => value === 0)).toBe(true);
  });

  it('AC-3.3.1 defaults the series to the top movers when no tags are given', async () => {
    const radar = RadarSchema.parse((await get('')).body);
    expect(radar.movers.map(({ tag, deltaPct }) => [tag, deltaPct])).toEqual([
      ['rust', 600],
      ['vue', -83],
    ]);
    expect(radar.series.map(({ tag }) => tag)).toEqual(['rust', 'vue']);
  });

  it('AC-3.3.1 treats an empty tags value like no tags and does not cache it as an empty series', async () => {
    for (const query of ['?tags=', '?tags=,']) {
      const radar = RadarSchema.parse((await get(query)).body);
      expect(radar.series.map(({ tag }) => tag)).toEqual(['rust', 'vue']);
    }
    expect(RadarSchema.parse((await get('')).body).series).toHaveLength(2);
  });

  it('AC-3.3.1 counts a repeated tag once toward the limit of 5', async () => {
    const response = await get('?tags=rust,rust,rust,rust,rust,rust');
    expect(response.status).toBe(200);
    expect(RadarSchema.parse(response.body).series.map(({ tag }) => tag)).toEqual(['rust']);
  });

  it('AC-3.3.1 answers 400 VALIDATION_FAILED for 6 tags, an unknown tag or a bad window', async () => {
    for (const query of [
      '?tags=react,vue,rust,go,python,css',
      '?tags=nonsense',
      '?window=14d',
      '?metric=likes',
    ]) {
      const response = await get(query);
      expect(response.status).toBe(400);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
    }
    expect((await get('?tags=react,vue,rust,go,python')).status).toBe(200);
  });

  it('AC-1.7.8 answers GET /radar (radar has no flag)', async () => {
    const response = await get('');
    expect(response.status).toBe(200);
    expect(RadarSchema.parse(response.body)).toMatchObject({ window: '7d' });
  });

  it('serves a cached response within the hour and a fresh one after the post-run cache clear', async () => {
    const before = RadarSchema.parse((await get('?tags=css')).body);
    expect(before.series[0]?.points.at(-1)?.value).toBe(0);

    await prisma.tagDailyStat.create({ data: stat(1, 'css', 9) });
    const cached = RadarSchema.parse((await get('?tags=css')).body);
    expect(cached).toEqual(before);

    await on.get(FeedCacheClearStep).run();
    const fresh = RadarSchema.parse((await get('?tags=css')).body);
    expect(fresh.series[0]?.points.at(-1)?.value).toBe(9);
  });
});
