import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { expect } from 'vitest';
import { loadEnv } from '../../src/env.js';

const env = loadEnv();

let clientCounter = 0;

/** Signs a fresh user in through the test route; each call gets its own email and client IP, so per-user and per-IP limits stay out of other tests' way. */
export async function signInUser(app: INestApplication, emailPrefix: string) {
  clientCounter += 1;
  const ip = `198.51.100.${clientCounter}`;
  const http = () => request(app.getHttpServer());
  const response = await http()
    .post('/api/auth/test/sign-in')
    .set('Origin', env.APP_URL)
    .set('X-Forwarded-For', ip)
    .send({ email: `${emailPrefix}${clientCounter}@example.com` });
  expect(response.status).toBe(200);
  const cookie = (response.get('Set-Cookie') ?? []).map((c) => c.split(';')[0]).join('; ');
  const read = (test: request.Test) => test.set('Cookie', cookie).set('X-Forwarded-For', ip);
  const write = (test: request.Test, body?: unknown) =>
    read(test)
      .set('Origin', env.APP_URL)
      .send((body ?? {}) as object);
  return {
    userId: (response.body as { userId: string }).userId,
    get: (path: string) => read(http().get(path)),
    post: (path: string, body?: unknown) => write(http().post(path), body),
    put: (path: string, body?: unknown) => write(http().put(path), body),
    patch: (path: string, body?: unknown) => write(http().patch(path), body),
    del: (path: string) => read(http().delete(path)).set('Origin', env.APP_URL),
    /** A mutation with a foreign Origin. */
    foreignOrigin: (method: 'post' | 'put' | 'patch' | 'delete', path: string) =>
      read(http()[method](path)).set('Origin', 'https://evil.example').send({}),
  };
}

export type SignedInUser = Awaited<ReturnType<typeof signInUser>>;
