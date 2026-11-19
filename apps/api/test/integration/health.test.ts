import type { INestApplication } from '@nestjs/common';
import { HealthSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

describe('GET /api/v1/health', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  it('AC-1.7.1 returns ok with db ok, a version and healthy sources', async () => {
    await createSource(prisma, 'fresh', 'hn', { lastSuccessAt: new Date() });
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(200);
    const health = HealthSchema.parse(response.body);
    expect(health.status).toBe('ok');
    expect(health.version).toBeTruthy();
    expect(health.sources).toEqual([
      { slug: 'fresh', kind: 'hn', status: 'healthy', lastSuccessAt: expect.any(String) },
    ]);
  });

  it('AC-1.7.1 reports degraded when an enabled source is stale or has an open circuit', async () => {
    await createSource(prisma, 'never', 'rss');
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(200);
    const health = HealthSchema.parse(response.body);
    expect(health.status).toBe('degraded');
    expect(health.sources.find((source) => source.slug === 'never')?.status).toBe('stale');
  });

  it('AC-1.7.1 answers 503 UPSTREAM_UNAVAILABLE when the database is unreachable', async () => {
    const spy = vi
      .spyOn(app.get(PrismaService), '$queryRaw')
      .mockRejectedValueOnce(new Error('connection refused'));
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    spy.mockRestore();
  });
});
