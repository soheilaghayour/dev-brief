import type { INestApplication } from '@nestjs/common';
import { StoryDetailSchema, StoryLookupResponseSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const MISSING_ID = 'cmissingmissingmissing0000';

describe('stories endpoints', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;
  let firstId = '';
  let secondId = '';

  const lookup = (body: unknown) =>
    request(app.getHttpServer())
      .post('/api/v1/stories/lookup')
      .set('Origin', process.env.APP_URL ?? '')
      .send(body as object);

  beforeAll(async () => {
    const hn = await createSource(prisma, 'hn', 'hn');
    const devto = await createSource(prisma, 'devto', 'devto');
    firstId = (
      await createStory(prisma, {
        title: 'First story',
        publishedAt: new Date('2026-05-01T10:00:00Z'),
        tags: ['react'],
        itemSourceIds: [hn.id, devto.id],
      })
    ).id;
    secondId = (
      await createStory(prisma, {
        title: 'Second story',
        publishedAt: new Date('2026-05-02T10:00:00Z'),
        itemSourceIds: [hn.id],
      })
    ).id;
    app = await createTestApp();
  });

  afterAll(() => app.close());

  it('GET /stories/:id returns the detail with one entry per SourceItem', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/stories/${firstId}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    const detail = StoryDetailSchema.parse(response.body);
    expect(detail.title).toBe('First story');
    expect(detail.items).toHaveLength(2);
    expect(detail.sources).toHaveLength(2);
  });

  it('GET /stories/:id answers 404 NOT_FOUND for an unknown id', async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/stories/${MISSING_ID}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /stories/:id answers 400 VALIDATION_FAILED for a malformed id', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/stories/not-an-id');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /stories/lookup preserves input order and reports unknown ids in missingIds', async () => {
    const response = await lookup({ ids: [secondId, MISSING_ID, firstId] });
    expect(response.status).toBe(200);
    const result = StoryLookupResponseSchema.parse(response.body);
    expect(result.items.map((item) => item.id)).toEqual([secondId, firstId]);
    expect(result.missingIds).toEqual([MISSING_ID]);
  });

  it('POST /stories/lookup rejects 0 and more than 100 ids', async () => {
    expect((await lookup({ ids: [] })).status).toBe(400);
    const tooMany = Array.from({ length: 101 }, () => MISSING_ID);
    const response = await lookup({ ids: tooMany });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('POST /stories/lookup requires the Origin header', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/stories/lookup')
      .send({ ids: [firstId] });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN_ORIGIN');
  });
});
