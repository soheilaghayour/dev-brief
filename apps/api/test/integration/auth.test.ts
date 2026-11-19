import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, MeSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { AUTH_RATE_LIMIT_PER_MINUTE } from '../../src/modules/auth/authRateLimit.js';
import { createTestApp } from './createTestApp.js';
import { createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const env = loadEnv();
const SIGN_IN_PATH = '/api/auth/test/sign-in';
const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
const DAY_MS = 86_400_000;

function withApp(app: INestApplication) {
  return request(app.getHttpServer());
}

// Every flow gets its own client IP, so the file's many auth requests stay under the 10/min limit.
let lastClientOctet = 0;
function freshClientIp() {
  lastClientOctet += 1;
  return `198.51.100.${lastClientOctet}`;
}

function setCookiesOf(response: request.Response) {
  return response.get('Set-Cookie') ?? [];
}

function cookieHeader(setCookies: string[]) {
  return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

// A same-origin POST to /api/auth/* from one client.
function authPost(app: INestApplication, path: string, clientIp = freshClientIp()) {
  return withApp(app).post(path).set('Origin', env.APP_URL).set('X-Forwarded-For', clientIp);
}

function startGitHubSignIn(app: INestApplication, callbackURL: string, clientIp = freshClientIp()) {
  return authPost(app, '/api/auth/sign-in/social', clientIp).send({
    provider: 'github',
    callbackURL,
    disableRedirect: true,
  });
}

async function signIn(app: INestApplication, body: object = {}, clientIp = freshClientIp()) {
  const response = await authPost(app, SIGN_IN_PATH, clientIp).send(body);
  expect(response.status).toBe(200);
  const setCookies = setCookiesOf(response);
  return {
    response,
    setCookies,
    cookie: cookieHeader(setCookies),
    userId: (response.body as { userId: string }).userId,
  };
}

// GitHub's token, /user and /user/emails answers, so the OAuth callback runs without a live call.
let lastGitHubId = 4000;
function stubGitHub(email: string, verified: boolean) {
  lastGitHubId += 1;
  const realFetch = globalThis.fetch;
  const answers: Record<string, unknown> = {
    'https://github.com/login/oauth/access_token': {
      access_token: 'gho_test',
      token_type: 'bearer',
      scope: 'user:email',
    },
    'https://api.github.com/user': {
      id: lastGitHubId,
      login: 'octo',
      name: 'Octo Cat',
      email: null,
      avatar_url: 'https://avatars.example/octo',
    },
    'https://api.github.com/user/emails': [{ email, primary: true, verified }],
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!(url in answers)) return realFetch(input, init);
    return Promise.resolve(Response.json(answers[url]));
  });
}

async function signInWithGitHub(app: INestApplication) {
  const clientIp = freshClientIp();
  const start = await startGitHubSignIn(app, '/feed', clientIp);
  expect(start.status).toBe(200);
  const state = new URL((start.body as { url: string }).url).searchParams.get('state');
  return withApp(app)
    .get(`/api/auth/callback/github?code=test-code&state=${state}`)
    .set('Cookie', cookieHeader(setCookiesOf(start)))
    .set('X-Forwarded-For', clientIp);
}

describe('authentication', () => {
  let app: INestApplication;
  const prisma = useTestDatabase();

  beforeAll(async () => {
    process.env.AUTH_TEST_MODE = 'true';
    app = await createTestApp();
  });
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('AC-1.5.2 a day-old session is extended and its cookie re-issued (rolling 30 days)', async () => {
    const { cookie, userId } = await signIn(app, { email: 'rolling@example.com' });
    await prisma.session.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() + 28 * DAY_MS) },
    });

    const response = await withApp(app).get('/api/v1/me').set('Cookie', cookie);
    expect(response.status).toBe(200);
    const renewed = setCookiesOf(response).find((setCookie) =>
      setCookie.includes('session_token='),
    );
    expect(renewed).toMatch(new RegExp(`Max-Age=${THIRTY_DAYS_IN_SECONDS}`));
    const { expiresAt } = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29.9 * DAY_MS);
  });

  it('stores no client IP in the session row', async () => {
    const { userId } = await signIn(app, { email: 'no-ip@example.com' }, '203.0.113.7');
    const session = await prisma.session.findFirstOrThrow({ where: { userId } });
    expect(session.ipAddress).toBe('');
  });

  it('AC-1.5.1 GitHub asks for exactly the user:email scope', async () => {
    const response = await startGitHubSignIn(app, '/feed');
    expect(response.status).toBe(200);
    const authorizeUrl = new URL((response.body as { url: string }).url);
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe(
      'https://github.com/login/oauth/authorize',
    );
    expect(authorizeUrl.searchParams.get('scope')).toBe('user:email');
  });

  it('refuses an off-site callbackURL even under NODE_ENV=test', async () => {
    const response = await startGitHubSignIn(app, 'https://evil.example');
    expect(response.status).toBe(403);
  });

  it('AC-1.5.3 a GitHub sign-in with the same verified email links to the existing Google user', async () => {
    const { userId } = await signIn(app, { email: 'shared@example.com', providers: ['google'] });
    stubGitHub('shared@example.com', true);

    const callback = await signInWithGitHub(app);
    expect(callback.status).toBe(302);
    expect(callback.headers.location).toBe('/feed');
    expect(await prisma.user.count({ where: { email: 'shared@example.com' } })).toBe(1);
    const accounts = await prisma.account.findMany({
      where: { userId },
      orderBy: { providerId: 'asc' },
    });
    expect(accounts.map(({ providerId }) => providerId)).toEqual(['github', 'google']);
  });

  it('AC-1.5.3 refuses to link a GitHub account whose email GitHub has not verified', async () => {
    const { userId } = await signIn(app, { email: 'victim@example.com', providers: ['google'] });
    stubGitHub('victim@example.com', false);

    const callback = await signInWithGitHub(app);
    expect(callback.status).toBe(302);
    expect(new URL(callback.headers.location as string).searchParams.get('error')).toBe(
      'email_not_verified',
    );
    expect(setCookiesOf(callback).join(';')).not.toMatch(/session_token=[^;]/);
    expect(await prisma.account.count({ where: { userId, providerId: 'github' } })).toBe(0);
  });

  it('marks every /api/auth/* response private, no-store', async () => {
    const { response } = await signIn(app);
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('a repeated test sign-in adds no second Account row, and a bad body is a 400', async () => {
    const { userId } = await signIn(app, { email: 'again@example.com' });
    await signIn(app, { email: 'again@example.com' });
    expect(await prisma.account.count({ where: { userId } })).toBe(1);

    const invalid = await authPost(app, SIGN_IN_PATH).send({ email: 'not-an-email' });
    expect(invalid.status).toBe(400);
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
    await signIn(app, { email: 'doomed@example.com' });
    const story = await createStory(prisma, {
      title: 'Doomed',
      publishedAt: new Date(),
      itemSourceIds: [],
    });
    await prisma.save.create({ data: { userId, storyId: story.id } });

    const response = await withApp(app)
      .delete('/api/v1/me')
      .set('Cookie', cookie)
      .set('Origin', env.APP_URL);
    expect(response.status).toBe(204);
    expect(setCookiesOf(response).join(';')).toMatch(/session_token=;/);

    expect(await prisma.user.count({ where: { id: userId } })).toBe(0);
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.account.count({ where: { userId } })).toBe(0);
    expect(await prisma.save.count({ where: { userId } })).toBe(0);
    expect((await withApp(app).get('/api/v1/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('AC-1.5.8 after sign-out the session no longer authenticates', async () => {
    const clientIp = freshClientIp();
    const { cookie } = await signIn(app, { email: 'leaving@example.com' }, clientIp);
    const signOut = await authPost(app, '/api/auth/sign-out', clientIp).set('Cookie', cookie);
    expect(signOut.status).toBe(200);
    expect((await withApp(app).get('/api/v1/me').set('Cookie', cookie)).status).toBe(401);
  });

  it('limits /api/auth/* to 10 requests per client IP per minute', async () => {
    const clientIp = freshClientIp();
    const get = () => withApp(app).get('/api/auth/get-session').set('X-Forwarded-For', clientIp);
    for (let sent = 0; sent < AUTH_RATE_LIMIT_PER_MINUTE; sent++) {
      expect((await get()).status).toBe(200);
    }
    const limited = await get();
    expect(limited.status).toBe(429);
    expect(limited.headers['ratelimit-limit']).toBe(String(AUTH_RATE_LIMIT_PER_MINUTE));
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    expect(ApiErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
  });
});

describe('the test-only sign-in route', () => {
  it('returns 404 when AUTH_TEST_MODE is off', async () => {
    process.env.AUTH_TEST_MODE = 'false';
    const app = await createTestApp();
    try {
      const response = await authPost(app, SIGN_IN_PATH).send({});
      expect(response.status).toBe(404);
    } finally {
      await app.close();
      delete process.env.AUTH_TEST_MODE;
    }
  });
});
