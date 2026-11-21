import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, CopilotQuotaSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { copilotQuota } from '../../src/modules/copilot/copilotQuota.js';
import { createTestApp } from './createTestApp.js';
import { useTestDatabase } from './testDatabase.js';

const COPILOT_ON = {
  FEATURE_COPILOT: 'true',
  ANTHROPIC_API_KEY: 'test-key',
  IP_HASH_SECRET: 'test-ip-hash-secret-0123456789abcdef',
  AUTH_TEST_MODE: 'true',
};
const env = loadEnv({ ...process.env, ...COPILOT_ON });
const DEVICE = '4f0c1c1e-1b0a-4d27-9a38-3f1c2c0f9a11';
const IP = '203.0.113.77';

describe('GET /copilot/quota', () => {
  const prisma = useTestDatabase();
  let app: INestApplication | undefined;

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany();
  });
  afterEach(() => app?.close());

  async function boot(envOverrides: Record<string, string> = {}) {
    app = await createTestApp([], { ...COPILOT_ON, ...envOverrides });
  }

  const quotaOf = (requester: Parameters<typeof copilotQuota>[0]) =>
    copilotQuota(requester, env.IP_HASH_SECRET ?? '', new Date());

  function getQuota(query: string, headers: Record<string, string> = {}) {
    return request(app!.getHttpServer())
      .get(`/api/v1/copilot/quota${query}`)
      .set('X-Forwarded-For', IP)
      .set(headers);
  }

  async function signIn() {
    const response = await request(app!.getHttpServer())
      .post('/api/auth/test/sign-in')
      .set('Origin', env.APP_URL)
      .set('X-Forwarded-For', '203.0.113.78')
      .send({ email: 'quota@example.com' });
    const cookie = (response.get('Set-Cookie') ?? []).map((c) => c.split(';')[0]).join('; ');
    return { cookie, userId: (response.body as { userId: string }).userId };
  }

  it('AC-3.1.4 reports a guest the device limit, what is left and the next UTC midnight, never cached', async () => {
    await boot();
    const [device] = quotaOf({ kind: 'guest', ip: IP, deviceId: DEVICE }).counters;
    const { day } = quotaOf({ kind: 'guest', ip: IP, deviceId: DEVICE });
    await prisma.rateLimitCounter.create({ data: { key: device!.key, day, count: 1 } });

    const response = await getQuota(`?deviceId=${DEVICE}`);

    expect(response.status).toBe(200);
    expect(response.get('Cache-Control')).toBe('private, no-store');
    expect(CopilotQuotaSchema.parse(response.body)).toEqual({
      limit: 3,
      remaining: 2,
      resetsAt: new Date(Math.floor(Date.now() / 86_400_000 + 1) * 86_400_000).toISOString(),
    });
  });

  it('AC-3.1.4 reports the IP backstop when it leaves less than the device quota', async () => {
    await boot();
    const plan = quotaOf({ kind: 'guest', ip: IP, deviceId: DEVICE });
    await prisma.rateLimitCounter.create({
      data: { key: plan.counters[1]!.key, day: plan.day, count: 9 },
    });

    const response = await getQuota(`?deviceId=${DEVICE}`);

    expect(CopilotQuotaSchema.parse(response.body)).toMatchObject({ limit: 3, remaining: 1 });
  });

  it('AC-3.1.4 reports a user 20 a day, and ignores a deviceId', async () => {
    await boot();
    const user = await signIn();
    const plan = quotaOf({ kind: 'user', userId: user.userId });
    await prisma.rateLimitCounter.create({
      data: { key: plan.counters[0]!.key, day: plan.day, count: 7 },
    });

    const response = await getQuota(`?deviceId=${DEVICE}`, { Cookie: user.cookie });

    expect(CopilotQuotaSchema.parse(response.body)).toMatchObject({ limit: 20, remaining: 13 });
  });

  it('answers a guest without a deviceId with 400 VALIDATION_FAILED', async () => {
    await boot();

    const response = await getQuota('');

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('answers 404 FEATURE_DISABLED when the flag is off', async () => {
    await boot({ FEATURE_COPILOT: 'false' });

    const response = await getQuota(`?deviceId=${DEVICE}`);

    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('FEATURE_DISABLED');
  });
});
