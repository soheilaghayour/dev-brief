import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, HealthSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { utcDay } from '../../src/modules/llm/budget.js';
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
    expect(health.llm).toEqual({ spentTodayUsd: 0, capUsd: 0.06 });
  });

  it('AC-1.7.1 reports degraded when an enabled source is stale or has an open circuit', async () => {
    await createSource(prisma, 'never', 'rss');
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(200);
    const health = HealthSchema.parse(response.body);
    expect(health.status).toBe('degraded');
    expect(health.sources.find((source) => source.slug === 'never')?.status).toBe('stale');
  });

  it("AC-2.6.2 reports today's committed LLM spend and the global cap", async () => {
    const today = utcDay(new Date());
    const yesterday = new Date(today.getTime() - 86_400_000);
    const usage = { model: 'claude-haiku-5-5', reservedUsd: '0.00075' };
    await prisma.llmUsage.createMany({
      data: [
        { ...usage, day: today, feature: 'summary_auto', status: 'settled', costUsd: '0.0003' },
        { ...usage, day: today, feature: 'summary_on_demand', status: 'reserved' },
        { ...usage, day: yesterday, feature: 'summary_auto', status: 'settled', costUsd: '0.0007' },
        { ...usage, day: yesterday, feature: 'copilot', status: 'reserved' },
      ],
    });

    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    // The settled row at its cost plus the open reservation at its worst case.
    expect(HealthSchema.parse(response.body).llm).toEqual({ spentTodayUsd: 0.00105, capUsd: 0.06 });
  });

  it('AC-1.7.1 answers 503 UPSTREAM_UNAVAILABLE when the database is unreachable', async () => {
    const spy = vi
      .spyOn(app.get(PrismaService), '$queryRaw')
      .mockRejectedValueOnce(new Error('connection refused'));
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('UPSTREAM_UNAVAILABLE');
    spy.mockRestore();
  });

  it('answers 503 when the database fails after the connectivity check', async () => {
    const spy = vi
      .spyOn(app.get(PrismaService).source, 'findMany')
      .mockRejectedValueOnce(new Error('connection reset'));
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('UPSTREAM_UNAVAILABLE');
    spy.mockRestore();
  });

  it('answers 503 instead of hanging when the database never responds', async () => {
    const spy = vi
      .spyOn(app.get(PrismaService), '$queryRaw')
      .mockImplementationOnce(() => new Promise(() => {}) as never);
    const response = await request(app.getHttpServer()).get('/api/v1/health');
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('UPSTREAM_UNAVAILABLE');
    spy.mockRestore();
  }, 10_000);
});
