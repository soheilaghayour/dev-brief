import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, FEED_LIST_MAX, PreferencesSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MUTATIONS_LIMIT } from '../../src/common/rate-limit/userRateLimit.guard.js';
import { loadEnv } from '../../src/env.js';
import { createTestApp } from './createTestApp.js';
import { useTestDatabase } from './testDatabase.js';

const env = loadEnv();
const PATH = '/api/v1/me/preferences';
const UNKNOWN_STORY_ID = 'cunknownstoryxxxxxxxxxx';
const EMPTY = { follow: { tags: [], sources: [] }, mute: { tags: [], sources: [] } };

describe('preferences', () => {
  let app: INestApplication;
  const prisma = useTestDatabase();

  const http = () => request(app.getHttpServer());

  // A fresh user and client IP per call keeps the per-user and per-IP limits out of other tests' way.
  let clientCounter = 0;
  async function signIn() {
    clientCounter += 1;
    const ip = `203.0.113.${clientCounter}`;
    const response = await http()
      .post('/api/auth/test/sign-in')
      .set('Origin', env.APP_URL)
      .set('X-Forwarded-For', ip)
      .send({ email: `prefs${clientCounter}@example.com` });
    expect(response.status).toBe(200);
    const cookie = (response.get('Set-Cookie') ?? []).map((c) => c.split(';')[0]).join('; ');
    const withSession = (test: request.Test) =>
      test.set('Cookie', cookie).set('X-Forwarded-For', ip);
    return {
      userId: (response.body as { userId: string }).userId,
      get: () => withSession(http().get(PATH)),
      put: (body: unknown) =>
        withSession(http().put(PATH))
          .set('Origin', env.APP_URL)
          .send(body as object),
      del: (path: string) => withSession(http().delete(path)).set('Origin', env.APP_URL),
    };
  }

  beforeAll(async () => {
    // Preferences have no flag.
    app = await createTestApp([], { AUTH_TEST_MODE: 'true' });
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET answers 401 UNAUTHENTICATED signed out, and so does PUT', async () => {
    const get = await http().get(PATH);
    const put = await http().put(PATH).set('Origin', env.APP_URL).send(EMPTY);
    for (const response of [get, put]) {
      expect(response.status).toBe(401);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('GET answers 200 with empty lists for a new user, private and never stored', async () => {
    const user = await signIn();
    const response = await user.get();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(PreferencesSchema.parse(response.body)).toEqual(EMPTY);
  });

  it('PUT stores the set and answers it, lists sorted and repeats dropped; GET reads the same', async () => {
    const user = await signIn();
    const response = await user.put({
      follow: { tags: ['rust', 'react', 'rust'], sources: ['rss-react-blog'] },
      mute: { tags: ['career'], sources: ['hn', 'devto'] },
    });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const stored = {
      follow: { tags: ['react', 'rust'], sources: ['rss-react-blog'] },
      mute: { tags: ['career'], sources: ['devto', 'hn'] },
    };
    expect(PreferencesSchema.parse(response.body)).toEqual(stored);
    expect(PreferencesSchema.parse((await user.get()).body)).toEqual(stored);
  });

  it('PUT replaces fully: a second PUT with fewer entries removes the others', async () => {
    const user = await signIn();
    await user.put({
      follow: { tags: ['react', 'rust'], sources: ['hn'] },
      mute: { tags: ['career'], sources: [] },
    });
    const second = await user.put({
      follow: { tags: ['rust'], sources: [] },
      mute: { tags: [], sources: [] },
    });
    expect(second.status).toBe(200);
    expect(PreferencesSchema.parse((await user.get()).body)).toEqual({
      follow: { tags: ['rust'], sources: [] },
      mute: { tags: [], sources: [] },
    });
    expect(await prisma.feedPreference.count({ where: { userId: user.userId } })).toBe(1);
  });

  it('serialises concurrent PUTs sharing a value: both answer 200 and the stored set is one of them', async () => {
    const user = await signIn();
    const first = { ...EMPTY, follow: { tags: ['react', 'rust'], sources: ['hn'] } };
    const second = { ...EMPTY, follow: { tags: ['rust'], sources: ['devto'] } };
    // Several rounds, since one pair may not interleave; unserialised, a round collides on rust and answers 500.
    for (let round = 0; round < 5; round++) {
      const responses = await Promise.all([user.put(first), user.put(second)]);
      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect([first, second]).toContainEqual(PreferencesSchema.parse((await user.get()).body));
    }
  });

  it('PUT with the same value in follow and mute answers 400 VALIDATION_FAILED and stores nothing', async () => {
    const user = await signIn();
    const response = await user.put({
      follow: { tags: ['react'], sources: [] },
      mute: { tags: ['react'], sources: [] },
    });
    expect(response.status).toBe(400);
    const { error } = ApiErrorSchema.parse(response.body);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.map((detail) => detail.path)).toEqual(['mute.tags.0']);
    expect(await prisma.feedPreference.count({ where: { userId: user.userId } })).toBe(0);
  });

  it('PUT answers 400 for a list over FEED_LIST_MAX or a malformed source slug', async () => {
    const user = await signIn();
    const sources = Array.from({ length: FEED_LIST_MAX + 1 }, (_, index) => `rss-${index}`);
    const tooMany = await user.put({ ...EMPTY, follow: { tags: [], sources } });
    const badSlug = await user.put({ ...EMPTY, mute: { tags: [], sources: ['hn,devto'] } });
    for (const response of [tooMany, badSlug]) {
      expect(response.status).toBe(400);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('AC-1.5.9 PUT with a foreign Origin answers 403 FORBIDDEN_ORIGIN', async () => {
    const user = await signIn();
    const response = await user.put(EMPTY).set('Origin', 'https://evil.example');
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('AC-1.7.8 GET and PUT answer (preferences have no flag)', async () => {
    const user = await signIn();
    expect((await user.get()).status).toBe(200);
    expect((await user.put(EMPTY)).status).toBe(200);
  });

  it('PUT shares the 60/min mutations bucket with the saves routes', async () => {
    const user = await signIn();
    for (let sent = 0; sent < MUTATIONS_LIMIT.perMinute; sent++) {
      expect((await user.del(`/api/v1/me/saves/${UNKNOWN_STORY_ID}`)).status).toBe(204);
    }
    const limited = await user.put(EMPTY);
    expect(limited.status).toBe(429);
    expect(ApiErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
  });

  it('AC-1.6.2 DELETE /me also removes the preferences of the user', async () => {
    const user = await signIn();
    await user.put({ ...EMPTY, follow: { tags: ['rust'], sources: ['hn'] } });
    expect(await prisma.feedPreference.count({ where: { userId: user.userId } })).toBe(2);
    expect((await user.del('/api/v1/me')).status).toBe(204);
    expect(await prisma.feedPreference.count({ where: { userId: user.userId } })).toBe(0);
  });
});
