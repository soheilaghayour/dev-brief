import type { INestApplication } from '@nestjs/common';
import { SourceListSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

describe('GET /api/v1/sources', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;

  beforeAll(async () => {
    const now = Date.now();
    await createSource(prisma, 'fresh', 'hn', { lastSuccessAt: new Date(now - 60_000) });
    await createSource(prisma, 'old', 'rss', { lastSuccessAt: new Date(now - 5 * 3_600_000) });
    await createSource(prisma, 'failing', 'devto', { lastErrorAt: new Date(now - 60_000) });
    await createSource(prisma, 'broken', 'github', {
      lastSuccessAt: new Date(now - 60_000),
      circuitOpenUntil: new Date(now + 3_600_000),
    });
    await createSource(prisma, 'disabled', 'rss', { enabled: false });
    app = await createTestApp();
  });

  afterAll(() => app.close());

  it('GET /sources lists enabled sources with healthy, stale and circuit_open status', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/sources');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(PUBLIC_CACHE);
    const { sources } = SourceListSchema.parse(response.body);
    const statusBySlug = Object.fromEntries(sources.map((source) => [source.slug, source.status]));
    expect(statusBySlug).toEqual({
      fresh: 'healthy',
      old: 'stale',
      failing: 'stale',
      broken: 'circuit_open',
    });
    expect(sources.find((source) => source.slug === 'failing')?.lastSuccessAt).toBeNull();
  });
});
