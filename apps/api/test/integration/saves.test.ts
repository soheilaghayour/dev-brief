import type { INestApplication } from '@nestjs/common';
import {
  ApiErrorSchema,
  MergeResponseSchema,
  SaveIdsSchema,
  SaveSchema,
  SavedStoryPageSchema,
} from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const env = loadEnv();
const SIGN_IN_PATH = '/api/auth/test/sign-in';
const UNKNOWN_STORY_ID = 'cunknownstoryxxxxxxxxxx';
const EARLY = '2026-01-01T00:00:00.000Z';
const LATE = '2026-02-01T00:00:00.000Z';

describe('account saves', () => {
  let app: INestApplication;
  let storyIds: string[];
  const prisma = useTestDatabase();

  const http = () => request(app.getHttpServer());
  // The seeded story ids in creation order.
  const story = (index: number) => storyIds[index] ?? '';

  // A fresh user and client IP per call keeps the per-user and per-IP limits out of other tests' way.
  let clientCounter = 0;
  async function signIn() {
    clientCounter += 1;
    const ip = `203.0.113.${clientCounter}`;
    const response = await http()
      .post(SIGN_IN_PATH)
      .set('Origin', env.APP_URL)
      .set('X-Forwarded-For', ip)
      .send({ email: `saver${clientCounter}@example.com` });
    expect(response.status).toBe(200);
    const cookie = (response.get('Set-Cookie') ?? []).map((c) => c.split(';')[0]).join('; ');
    const userId = (response.body as { userId: string }).userId;
    return {
      userId,
      get: (path: string) => http().get(path).set('Cookie', cookie).set('X-Forwarded-For', ip),
      put: (path: string) =>
        http()
          .put(path)
          .set('Cookie', cookie)
          .set('Origin', env.APP_URL)
          .set('X-Forwarded-For', ip),
      del: (path: string) =>
        http()
          .delete(path)
          .set('Cookie', cookie)
          .set('Origin', env.APP_URL)
          .set('X-Forwarded-For', ip),
      merge: (body: unknown) =>
        http()
          .post('/api/v1/me/merge')
          .set('Cookie', cookie)
          .set('Origin', env.APP_URL)
          .set('X-Forwarded-For', ip)
          .send(body as object),
    };
  }

  beforeAll(async () => {
    // The merge's preferences work with the preferences flag off.
    app = await createTestApp([], { AUTH_TEST_MODE: 'true', FEATURE_PREFERENCES: 'false' });
    const source = await createSource(prisma, 'saves-blog', 'rss');
    const stories = [];
    for (const [index, title] of ['Alpha', 'Bravo', 'Charlie', 'Delta'].entries()) {
      stories.push(
        await createStory(prisma, {
          title,
          publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
          itemSourceIds: [source.id],
        }),
      );
    }
    storyIds = stories.map((story) => story.id);
  });
  afterAll(async () => {
    await app.close();
  });

  it('AC-1.5.4 PUT saves a story idempotently and answers a Save', async () => {
    const user = await signIn();
    const first = await user.put(`/api/v1/me/saves/${story(0)}`);
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    const save = SaveSchema.parse(first.body);

    const second = await user.put(`/api/v1/me/saves/${story(0)}`);
    expect(second.status).toBe(200);
    expect(SaveSchema.parse(second.body)).toEqual(save);
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(1);
  });

  it('AC-1.5.4 DELETE unsaves idempotently with 204', async () => {
    const user = await signIn();
    await user.put(`/api/v1/me/saves/${story(0)}`);
    expect((await user.del(`/api/v1/me/saves/${story(0)}`)).status).toBe(204);
    expect((await user.del(`/api/v1/me/saves/${story(0)}`)).status).toBe(204);
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(0);
  });

  it('PUT answers 404 NOT_FOUND for an unknown story; PUT and DELETE answer 400 for a malformed id', async () => {
    const user = await signIn();
    const missing = await user.put(`/api/v1/me/saves/${UNKNOWN_STORY_ID}`);
    expect(missing.status).toBe(404);
    expect(ApiErrorSchema.parse(missing.body).error.code).toBe('NOT_FOUND');

    const malformed = await user.put('/api/v1/me/saves/not-an-id');
    expect(malformed.status).toBe(400);
    expect(ApiErrorSchema.parse(malformed.body).error.code).toBe('VALIDATION_FAILED');

    const malformedDelete = await user.del('/api/v1/me/saves/not-an-id');
    expect(malformedDelete.status).toBe(400);
    expect(ApiErrorSchema.parse(malformedDelete.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('every saves route answers 401 UNAUTHENTICATED without a session', async () => {
    const origin = { Origin: env.APP_URL };
    const responses = [
      await http().get('/api/v1/me/saves'),
      await http().get('/api/v1/me/saves/ids'),
      await http()
        .put(`/api/v1/me/saves/${story(0)}`)
        .set(origin),
      await http()
        .delete(`/api/v1/me/saves/${story(0)}`)
        .set(origin),
      await http().post('/api/v1/me/merge').set(origin).send({ version: 1, saves: [] }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('AC-1.5.9 mutations answer 403 FORBIDDEN_ORIGIN for a foreign Origin', async () => {
    const user = await signIn();
    const foreign = 'https://evil.example';
    const put = await user.put(`/api/v1/me/saves/${story(0)}`).set('Origin', foreign);
    const del = await user.del(`/api/v1/me/saves/${story(0)}`).set('Origin', foreign);
    const merge = await user.merge({ version: 1, saves: [] }).set('Origin', foreign);
    for (const response of [put, del, merge]) {
      expect(response.status).toBe(403);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('FORBIDDEN_ORIGIN');
    }
  });

  it('AC-1.5.7 GET /me/saves/ids lists the saved ids of the signed-in user only', async () => {
    const user = await signIn();
    const other = await signIn();
    await user.put(`/api/v1/me/saves/${story(0)}`);
    await other.put(`/api/v1/me/saves/${story(1)}`);

    const response = await user.get('/api/v1/me/saves/ids');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(SaveIdsSchema.parse(response.body).ids).toEqual([story(0)]);
  });

  it('AC-1.5.7 GET /me/saves pages newest-saved first with a cursor', async () => {
    const user = await signIn();
    await user.merge({
      version: 1,
      saves: [
        { storyId: story(0), savedAt: '2026-03-01T00:00:00.000Z' },
        { storyId: story(1), savedAt: '2026-03-03T00:00:00.000Z' },
        { storyId: story(2), savedAt: '2026-03-02T00:00:00.000Z' },
      ],
    });

    const first = await user.get('/api/v1/me/saves?limit=2');
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    const firstPage = SavedStoryPageSchema.parse(first.body);
    expect(firstPage.items.map((item) => item.story.id)).toEqual([story(1), story(2)]);
    expect(firstPage.nextCursor).not.toBeNull();

    const second = await user.get(`/api/v1/me/saves?limit=2&cursor=${firstPage.nextCursor}`);
    const secondPage = SavedStoryPageSchema.parse(second.body);
    expect(secondPage.items.map((item) => item.story.id)).toEqual([story(0)]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it('GET /me/saves answers 400 for a bad limit and INVALID_CURSOR for a foreign cursor', async () => {
    const user = await signIn();
    const badLimit = await user.get('/api/v1/me/saves?limit=0');
    expect(badLimit.status).toBe(400);
    expect(ApiErrorSchema.parse(badLimit.body).error.code).toBe('VALIDATION_FAILED');

    const feed = await http().get('/api/v1/feed?limit=1&sort=latest');
    const feedCursor = (feed.body as { nextCursor: string | null }).nextCursor;
    const cursor = feedCursor ?? 'garbage';
    const foreign = await user.get(`/api/v1/me/saves?cursor=${cursor}`);
    expect(foreign.status).toBe(400);
    expect(ApiErrorSchema.parse(foreign.body).error.code).toBe('INVALID_CURSOR');
  });

  it('AC-1.5.5 merging twice creates no new rows and the earliest savedAt wins', async () => {
    const user = await signIn();
    await user.put(`/api/v1/me/saves/${story(0)}`);
    const existing = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(0) } },
    });
    const body = {
      version: 1,
      saves: [
        { storyId: story(0), savedAt: EARLY },
        { storyId: story(1), savedAt: LATE },
        { storyId: story(1), savedAt: EARLY },
      ],
    };

    const first = await user.merge(body);
    expect(first.status).toBe(200);
    expect(MergeResponseSchema.parse(first.body)).toEqual({
      merged: { saves: 2, preferences: 0 },
      skipped: { saves: 0 },
      missingStoryIds: [],
    });
    const afterFirst = await prisma.save.findMany({
      where: { userId: user.userId },
      orderBy: { storyId: 'asc' },
    });

    const second = await user.merge(body);
    expect(MergeResponseSchema.parse(second.body)).toEqual(MergeResponseSchema.parse(first.body));
    const afterSecond = await prisma.save.findMany({
      where: { userId: user.userId },
      orderBy: { storyId: 'asc' },
    });
    expect(afterSecond).toEqual(afterFirst);
    expect(afterSecond).toHaveLength(2);
    const savedAtOf = (storyId: string) =>
      afterSecond.find((row) => row.storyId === storyId)?.savedAt.toISOString();
    expect(savedAtOf(story(0))).toBe(EARLY);
    expect(savedAtOf(story(1))).toBe(EARLY);
    expect(new Date(EARLY).getTime()).toBeLessThan(existing.savedAt.getTime());
  });

  it('AC-1.5.5 a later local date does not move an earlier account date', async () => {
    const user = await signIn();
    await user.merge({ version: 1, saves: [{ storyId: story(2), savedAt: EARLY }] });
    await user.merge({ version: 1, saves: [{ storyId: story(2), savedAt: LATE }] });
    const row = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(2) } },
    });
    expect(row.savedAt.toISOString()).toBe(EARLY);
  });

  it('the merge reports unknown story ids in missingStoryIds and skipped, and saves the rest', async () => {
    const user = await signIn();
    const response = await user.merge({
      version: 1,
      saves: [
        { storyId: UNKNOWN_STORY_ID, savedAt: EARLY },
        { storyId: story(3), savedAt: EARLY },
      ],
    });
    expect(response.status).toBe(200);
    expect(MergeResponseSchema.parse(response.body)).toEqual({
      merged: { saves: 1, preferences: 0 },
      skipped: { saves: 1 },
      missingStoryIds: [UNKNOWN_STORY_ID],
    });
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(1);
  });

  it('AC-2.5.3 the merge keeps the server mode for the same (kind, value) and adds the other guest entries', async () => {
    const user = await signIn();
    await prisma.feedPreference.create({
      data: { userId: user.userId, kind: 'tag', value: 'react', mode: 'follow' },
    });
    const response = await user.merge({
      version: 1,
      saves: [],
      preferences: {
        follow: { tags: [], sources: [] },
        mute: { tags: ['react'], sources: ['hn'] },
      },
    });
    expect(response.status).toBe(200);
    expect(MergeResponseSchema.parse(response.body).merged).toEqual({ saves: 0, preferences: 2 });
    const rows = await prisma.feedPreference.findMany({
      where: { userId: user.userId },
      select: { kind: true, value: true, mode: true },
      orderBy: { value: 'asc' },
    });
    expect(rows).toEqual([
      { kind: 'source', value: 'hn', mode: 'mute' },
      { kind: 'tag', value: 'react', mode: 'follow' },
    ]);
  });

  it('AC-2.5.3 repeating a merge with preferences creates no rows and answers the same counts', async () => {
    const user = await signIn();
    const body = {
      version: 1,
      saves: [{ storyId: story(0), savedAt: EARLY }],
      preferences: {
        follow: { tags: ['rust'], sources: ['rss-react-blog'] },
        mute: { tags: ['career'], sources: [] },
      },
    };
    const first = await user.merge(body);
    expect(MergeResponseSchema.parse(first.body).merged).toEqual({ saves: 1, preferences: 3 });
    const rowsAfterFirst = await prisma.feedPreference.findMany({
      where: { userId: user.userId },
      orderBy: { value: 'asc' },
    });

    const second = await user.merge(body);
    expect(MergeResponseSchema.parse(second.body)).toEqual(MergeResponseSchema.parse(first.body));
    expect(
      await prisma.feedPreference.findMany({
        where: { userId: user.userId },
        orderBy: { value: 'asc' },
      }),
    ).toEqual(rowsAfterFirst);
    expect(rowsAfterFirst).toHaveLength(3);
  });

  it('the merge rejects preferences with the same value in follow and mute, and writes no save', async () => {
    const user = await signIn();
    const response = await user.merge({
      version: 1,
      saves: [{ storyId: story(0), savedAt: EARLY }],
      preferences: {
        follow: { tags: ['react'], sources: [] },
        mute: { tags: ['react'], sources: [] },
      },
    });
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(0);
  });

  it('the merge rejects more than 500 saves with 400 VALIDATION_FAILED', async () => {
    const user = await signIn();
    const saves = Array.from({ length: 501 }, () => ({ storyId: story(0), savedAt: EARLY }));
    const response = await user.merge({ version: 1, saves });
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
    expect((await user.merge({ version: 1, saves: saves.slice(0, 500) })).status).toBe(200);
  });

  it('AC-1.5.5 a merge of 500 distinct stories succeeds and a repeat changes nothing', async () => {
    const bulk = Array.from({ length: 500 }, (_, index) => ({
      canonicalUrl: `https://example.com/bulk-${index}`,
      url: `https://example.com/bulk-${index}`,
      domain: 'example.com',
      title: `Bulk ${index}`,
      normalizedTitle: `bulk ${index}`,
      publishedAt: new Date(Date.UTC(2026, 0, 1)),
      taggerVersion: 1,
    }));
    await prisma.story.createMany({ data: bulk });
    const rows = await prisma.story.findMany({
      where: { title: { startsWith: 'Bulk ' } },
      select: { id: true },
    });
    expect(rows).toHaveLength(500);

    const user = await signIn();
    const body = { version: 1, saves: rows.map((row) => ({ storyId: row.id, savedAt: LATE })) };
    const first = await user.merge(body);
    expect(first.status).toBe(200);
    expect(MergeResponseSchema.parse(first.body).merged.saves).toBe(500);
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(500);

    const second = await user.merge(body);
    expect(second.status).toBe(200);
    expect(MergeResponseSchema.parse(second.body).merged.saves).toBe(500);
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(500);
  });

  it('the merge route accepts a body past 100 KB and rejects one past 512 KB', async () => {
    const user = await signIn();
    const padded = (kilobytes: number) => ({
      version: 1,
      saves: [],
      padding: 'x'.repeat(kilobytes * 1024),
    });
    expect((await user.merge(padded(200))).status).toBe(200);
    const tooLarge = await user.merge(padded(600));
    expect(tooLarge.status).toBe(400);
    expect(ApiErrorSchema.parse(tooLarge.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('the merge is throttled at 10 per minute per user', async () => {
    const user = await signIn();
    for (let sent = 0; sent < 10; sent++) {
      expect((await user.merge({ version: 1, saves: [] })).status).toBe(200);
    }
    const limited = await user.merge({ version: 1, saves: [] });
    expect(limited.status).toBe(429);
    expect(ApiErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    const another = await signIn();
    expect((await another.merge({ version: 1, saves: [] })).status).toBe(200);
  });

  it('mutations are throttled at 60 per minute per user', async () => {
    const user = await signIn();
    for (let sent = 0; sent < 60; sent++) {
      expect((await user.del(`/api/v1/me/saves/${story(0)}`)).status).toBe(204);
    }
    expect((await user.del(`/api/v1/me/saves/${story(0)}`)).status).toBe(429);
  });
});
