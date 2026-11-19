import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, MeSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { createTestApp } from './createTestApp.js';
import { useTestDatabase } from './testDatabase.js';

const env = loadEnv();
const SIGN_IN_PATH = '/api/auth/test/sign-in';

function withApp(app: INestApplication) {
  return request(app.getHttpServer());
}

// The internal token skips the 10/min auth limit, which this file's many sign-ins would hit.
async function signIn(app: INestApplication, body: object = {}) {
  const response = await withApp(app)
    .post(SIGN_IN_PATH)
    .set('Origin', env.APP_URL)
    .set('x-internal-token', env.INTERNAL_API_TOKEN)
    .send(body);
  expect(response.status).toBe(200);
  const setCookies = response.headers['set-cookie'] as unknown as string[];
  return {
    setCookies,
    cookie: setCookies.map((cookie) => cookie.split(';')[0]).join('; '),
    userId: (response.body as { userId: string }).userId,
  };
}

describe('authentication', () => {
  let app: INestApplication;
  const prisma = useTestDatabase();

  beforeAll(async () => {
    process.env.AUTH_TEST_MODE = 'true';
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.AUTH_TEST_MODE;
  });

  it('AC-1.5.2 sets a httpOnly, Secure, SameSite=Lax, host-only session cookie', async () => {
    const { setCookies } = await signIn(app);
    const sessionCookie = setCookies.find((cookie) => cookie.includes('session_token'));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/Secure/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie).not.toMatch(/Domain=/i);
  });

  it('GET /me returns 401 UNAUTHENTICATED signed out', async () => {
    const response = await withApp(app).get('/api/v1/me');
    expect(response.status).toBe(401);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
  });

  it('GET /me returns 200 with a MeSchema body and private, no-store signed in', async () => {
    const { cookie, userId } = await signIn(app, { providers: ['github', 'google'] });
    const response = await withApp(app).get('/api/v1/me').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(MeSchema.parse(response.body)).toMatchObject({
      id: userId,
      email: 'test-user@example.com',
      providers: ['github', 'google'],
    });
  });

  it('AC-1.5.9 DELETE /me without a session returns 401, and with a foreign Origin 403', async () => {
    const signedOut = await withApp(app).delete('/api/v1/me').set('Origin', env.APP_URL);
    expect(signedOut.status).toBe(401);
    expect(ApiErrorSchema.parse(signedOut.body).error.code).toBe('UNAUTHENTICATED');

    const { cookie } = await signIn(app);
    const foreign = await withApp(app)
      .delete('/api/v1/me')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example');
    expect(foreign.status).toBe(403);
    expect(ApiErrorSchema.parse(foreign.body).error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('AC-1.6.2 DELETE /me removes the user, sessions, accounts and saves, and expires the cookie', async () => {
    const { cookie, userId } = await signIn(app, { email: 'doomed@example.com' });
    const story = await prisma.story.create({
      data: {
        canonicalUrl: 'https://example.com/doomed',
        title: 'Doomed',
        titleNormalized: 'doomed',
      },
    });
    await prisma.save.create({ data: { userId, storyId: story.id } });

    const response = await withApp(app)
      .delete('/api/v1/me')
      .set('Cookie', cookie)
      .set('Origin', env.APP_URL);
    expect(response.status).toBe(204);
    const setCookies = response.headers['set-cookie'] as unknown as string[];
    expect(setCookies.join(';')).toMatch(/session_token=;/);

    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.account.count({ where: { userId } })).toBe(0);
    expect(await prisma.save.count({ where: { userId } })).toBe(0);
    expect((await withApp(app).get('/api/v1/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('AC-1.5.8 after sign-out the session no longer authenticates', async () => {
    const { cookie } = await signIn(app, { email: 'leaving@example.com' });
    const signOut = await withApp(app)
      .post('/api/auth/sign-out')
      .set('Cookie', cookie)
      .set('Origin', env.APP_URL)
      .set('x-internal-token', env.INTERNAL_API_TOKEN);
    expect(signOut.status).toBe(200);
    expect((await withApp(app).get('/api/v1/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('limits /api/auth/* to 10 requests per client IP per minute', async () => {
    const get = () => withApp(app).get('/api/auth/get-session').set('X-Forwarded-For', '10.9.9.9');
    for (let sent = 0; sent < 10; sent++) expect((await get()).status).toBe(200);
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(ApiErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
  });
});

describe('the test-only sign-in route', () => {
  it('returns 404 when AUTH_TEST_MODE is off', async () => {
    process.env.AUTH_TEST_MODE = 'false';
    const app = await createTestApp();
    try {
      const response = await withApp(app)
        .post(SIGN_IN_PATH)
        .set('Origin', env.APP_URL)
        .set('x-internal-token', env.INTERNAL_API_TOKEN)
        .send({});
      expect(response.status).toBe(404);
    } finally {
      await app.close();
      delete process.env.AUTH_TEST_MODE;
    }
  });
});
