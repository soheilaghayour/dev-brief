import type { INestApplication } from '@nestjs/common';
import { StatsSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const HOUR = 3_600_000;

describe('GET /api/v1/stats', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;
  const lastSuccessAt = new Date(Date.now() - 20 * 60_000);

  beforeAll(async () => {
    const hn = await createSource(prisma, 'hn-main', 'hn', { lastSuccessAt });
    await createSource(prisma, 'blog', 'rss', { lastSuccessAt: new Date(Date.now() - 5 * HOUR) });
    await createSource(prisma, 'disabled', 'rss', { enabled: false, lastSuccessAt: new Date() });
    const itemSourceIds = [hn.id];
    await createStory(prisma, {
      title: 'Fresh one',
      publishedAt: new Date(Date.now() - HOUR),
      itemSourceIds,
    });
    await createStory(prisma, {
      title: 'Fresh two',
      publishedAt: new Date(Date.now() - 23 * HOUR),
      itemSourceIds,
    });
    await createStory(prisma, {
      title: 'Yesterday',
      publishedAt: new Date(Date.now() - 25 * HOUR),
      itemSourceIds,
    });
    app = await createTestApp();
  });

  afterAll(() => app.close());

  it('counts stories from the last 24 h and enabled sources, with the latest successful run', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/stats');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    expect(StatsSchema.parse(response.body)).toEqual({
      storiesToday: 2,
      sourceCount: 2,
      lastIngestedAt: lastSuccessAt.toISOString(),
    });
  });
});
