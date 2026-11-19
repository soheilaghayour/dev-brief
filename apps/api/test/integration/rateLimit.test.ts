import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RATE_LIMIT_PER_MINUTE } from '../../src/common/rate-limit/rateLimit.guard.js';
import { loadEnv } from '../../src/env.js';
import { createTestApp } from './createTestApp.js';

describe('rate limiting', () => {
  let app: INestApplication;
  const get = (forwardedFor: string) =>
    request(app.getHttpServer()).get('/api/v1/health').set('X-Forwarded-For', forwardedFor);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('sends RateLimit headers, then 429 RATE_LIMITED with Retry-After past the limit, per client IP', async () => {
    const first = await get('10.0.0.1');
    expect(first.headers['ratelimit-limit']).toBe(String(RATE_LIMIT_PER_MINUTE));
    expect(first.headers['ratelimit-remaining']).toBe(String(RATE_LIMIT_PER_MINUTE - 1));
    expect(first.headers['ratelimit-reset']).toBeDefined();

    for (let sent = 1; sent < RATE_LIMIT_PER_MINUTE; sent++) await get('10.0.0.1');
    const limited = await get('10.0.0.1');
    expect(limited.status).toBe(429);
    expect(ApiErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);

    expect((await get('10.0.0.2')).status).toBe(200);
  });

  it('skips the limit for a request carrying the internal token, and not for a wrong one', async () => {
    const send = (token: string) =>
      request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Forwarded-For', '10.0.0.1')
        .set('x-internal-token', token);
    // 10.0.0.1 is already past its limit from the test above.
    expect((await send(loadEnv().INTERNAL_API_TOKEN)).status).toBe(200);
    expect((await send('wrong-token-wrong-token')).status).toBe(429);
    expect((await send('short')).status).toBe(429);
  });

  it('trusts exactly one proxy hop, so a spoofed leading X-Forwarded-For entry does not escape the limit', async () => {
    const limited = await get('203.0.113.9, 10.0.0.1');
    expect(limited.status).toBe(429);
  });
});
