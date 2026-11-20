import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { HealthSchema, SourceListSchema, StatsSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { configureApp } from '../../src/configureApp.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { SOURCE_ADAPTERS, type SourceAdapter } from '../../src/modules/ingestion/sourceAdapter.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const failingRss: SourceAdapter = {
  kind: 'rss',
  fetch: () => Promise.reject(new Error('feed down')),
};

describe('a source that never finished a run', () => {
  const prisma = useTestDatabase();
  let app: NestExpressApplication;

  async function reported() {
    const server = app.getHttpServer();
    const [health, sources, stats] = await Promise.all([
      request(server).get('/api/v1/health'),
      request(server).get('/api/v1/sources'),
      request(server).get('/api/v1/stats'),
    ]);
    return {
      health: HealthSchema.parse(health.body),
      sources: SourceListSchema.parse(sources.body).sources,
      stats: StatsSchema.parse(stats.body),
    };
  }

  beforeAll(async () => {
    await createSource(prisma, 'fresh', 'hn', { lastSuccessAt: new Date() });
    await createSource(prisma, 'new-feed', 'rss');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SOURCE_ADAPTERS)
      .useValue([failingRss])
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('is left out of /health, /sources and the /stats source count', async () => {
    const { health, sources, stats } = await reported();
    expect(health.status).toBe('ok');
    expect(health.sources.map(({ slug }) => slug)).toEqual(['fresh']);
    expect(sources.map(({ slug }) => slug)).toEqual(['fresh']);
    expect(stats.sourceCount).toBe(1);
  });

  it('appears as stale after one failed run', async () => {
    await app.get(IngestionService).run();
    app.get(LruCache).clear();

    const { health, sources, stats } = await reported();
    expect(health.status).toBe('degraded');
    expect(health.sources.find(({ slug }) => slug === 'new-feed')?.status).toBe('stale');
    expect(sources.find(({ slug }) => slug === 'new-feed')?.status).toBe('stale');
    expect(stats.sourceCount).toBe(2);
  });
});
