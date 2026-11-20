import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, StorySummarySchema } from '@devbrief/shared';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { summaryQuota } from '../../src/modules/summaries/summaryQuota.js';
import { mockLanguageModel, modelReply } from '../mockLanguageModel.js';
import { summaryFixtureFetch } from '../summaryFixtures.js';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import { createDiscussedStory, SUMMARIES_ON } from './summariesTestModule.js';
import { useTestDatabase } from './testDatabase.js';

const env = loadEnv({ ...process.env, ...SUMMARIES_ON });
const MISSING_ID = 'cmissingmissingmissing0000';
// Every story is a different HN item; unrecorded ids are served this recorded thread.
const RECORDED_THREAD_ID = '50544168';
const DEVICE = '4f0c1c1e-1b0a-4d27-9a38-3f1c2c0f9a11';
const SIGN_IN_PATH = '/api/auth/test/sign-in';

const MODEL_OUTPUT = {
  tldr: [
    'Designated initializers let C callers name their arguments.',
    'A macro wraps a struct literal, so omitted fields default to zero.',
    'Commenters weigh clearer call sites against ABI and default-value limits.',
  ],
  consensus: { verdict: 'mixed', pros: ['Clear call sites.'], cons: ['Only zero defaults.'] },
};

describe('on-demand summaries', () => {
  const prisma = useTestDatabase();
  let hnSourceId = '';
  let app: INestApplication | undefined;
  let ipCounter = 0;

  beforeAll(async () => {
    hnSourceId = (await createSource(prisma, 'hn', 'hn')).id;
  });

  beforeEach(async () => {
    await prisma.llmUsage.deleteMany();
    await prisma.rateLimitCounter.deleteMany();
    await prisma.story.deleteMany();
  });

  afterEach(() => app?.close());

  async function boot({
    doGenerate = async () => modelReply(MODEL_OUTPUT),
    envOverrides = {},
    failing = [],
  }: {
    doGenerate?: Parameters<typeof mockLanguageModel>[0];
    envOverrides?: Record<string, string>;
    failing?: string[];
  } = {}) {
    const model = mockLanguageModel(doGenerate);
    app = await createTestApp(
      [],
      { ...SUMMARIES_ON, AUTH_TEST_MODE: 'true', ...envOverrides },
      {
        languageModel: model,
        upstreamFetch: summaryFixtureFetch({ hnFallbackId: RECORDED_THREAD_ID, failing }).fetch,
      },
    );
    return model;
  }

  // A fresh client IP per call keeps the 5/min IP window out of other requests' way.
  function post(
    storyId: string,
    { body = { deviceId: DEVICE }, ip, cookie = '' } = {} as {
      body?: object;
      ip?: string;
      cookie?: string;
    },
  ) {
    ipCounter += 1;
    return request(app!.getHttpServer())
      .post(`/api/v1/stories/${storyId}/summary`)
      .set('Origin', env.APP_URL)
      .set('X-Forwarded-For', ip ?? `198.51.100.${ipCounter}`)
      .set('Cookie', cookie)
      .send(body);
  }

  async function signIn() {
    ipCounter += 1;
    const response = await request(app!.getHttpServer())
      .post(SIGN_IN_PATH)
      .set('Origin', env.APP_URL)
      .set('X-Forwarded-For', `192.0.2.${ipCounter}`)
      .send({ email: `summarizer${ipCounter}@example.com` });
    expect(response.status).toBe(200);
    const cookie = (response.get('Set-Cookie') ?? []).map((c) => c.split(';')[0]).join('; ');
    return { cookie, userId: (response.body as { userId: string }).userId };
  }

  let storyCounter = 0;
  const story = (title: string) => {
    storyCounter += 1;
    return createDiscussedStory(prisma, {
      title,
      sourceId: hnSourceId,
      externalId: String(9_000_000 + storyCounter),
    });
  };

  it('AC-2.3.2 generates, answers 201 and writes the Summary and LlmUsage rows', async () => {
    const created = await story('Named args');
    await boot();

    const response = await post(created.id);

    expect(response.status).toBe(201);
    expect(response.get('Cache-Control')).toBe('private, no-store');
    expect(StorySummarySchema.parse(response.body)).toMatchObject({ storyId: created.id });
    const usage = await prisma.llmUsage.findFirstOrThrow({ where: { refId: created.id } });
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(Number(usage.costUsd)).toBeGreaterThan(0);
    const row = await prisma.summary.findUniqueOrThrow({ where: { storyId: created.id } });
    expect(row.trigger).toBe('on_demand');
  });

  it('AC-2.3.1 serves an existing summary with 200, no model call and no quota used', async () => {
    const cached = await story('Cached');
    const model = await boot();
    expect((await post(cached.id)).status).toBe(201);
    await prisma.rateLimitCounter.deleteMany();
    const callsBefore = model.doGenerateCalls.length;

    const response = await post(cached.id);

    expect(response.status).toBe(200);
    expect(StorySummarySchema.parse(response.body).storyId).toBe(cached.id);
    expect(model.doGenerateCalls).toHaveLength(callsBefore);
    expect(await prisma.rateLimitCounter.count()).toBe(0);
  });

  it('AC-2.3.3 answers the 6th guest generation with 429, resetsAt at UTC midnight and Retry-After', async () => {
    const target = await story('Quota guest');
    await boot();
    const ip = '198.51.100.250';
    const quota = summaryQuota(
      { kind: 'guest', ip, deviceId: DEVICE },
      env.IP_HASH_SECRET ?? '',
      new Date(),
    );
    await prisma.rateLimitCounter.create({ data: { key: quota.key, day: quota.day, count: 5 } });

    const response = await post(target.id, { ip });

    expect(response.status).toBe(429);
    const error = ApiErrorSchema.parse(response.body).error;
    expect(error).toMatchObject({ code: 'QUOTA_EXCEEDED', resetsAt: quota.resetsAt.toISOString() });
    expect(Number(response.get('Retry-After'))).toBeGreaterThan(0);
    expect(await prisma.summary.count()).toBe(0);
    const counter = await prisma.rateLimitCounter.findFirstOrThrow({ where: { key: quota.key } });
    expect(counter.count).toBe(5);
  });

  it('AC-2.3.3 answers the 21st user generation with 429, and a cached hit after the limit with 200', async () => {
    const fresh = await story('Quota user');
    const cached = await story('Quota user cached');
    await boot();
    const { cookie, userId } = await signIn();
    const quota = summaryQuota({ kind: 'user', userId }, env.IP_HASH_SECRET ?? '', new Date());
    await prisma.rateLimitCounter.create({ data: { key: quota.key, day: quota.day, count: 20 } });
    await prisma.summary.create({
      data: {
        storyId: cached.id,
        tldr: ['a', 'b', 'c'],
        basedOnComments: 0,
        trigger: 'auto',
        model: 'claude-haiku-5-5',
        promptVersion: 1,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: '0.000001',
      },
    });

    expect((await post(fresh.id, { cookie, body: {} })).status).toBe(429);
    expect((await post(cached.id, { cookie, body: {} })).status).toBe(200);
  });

  it('AC-2.3.3 gives the slot back after a failed generation', async () => {
    const target = await story('Slot back');
    await boot({ failing: ['hn.algolia.com'] });

    const response = await post(target.id);

    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('UPSTREAM_UNAVAILABLE');
    const counters = await prisma.rateLimitCounter.findMany();
    expect(counters.map((counter) => counter.count)).toEqual([0]);
  });

  it('AC-2.3.4 answers 503 SPEND_CAP_REACHED with no quota used when the on-demand cap is spent', async () => {
    const target = await story('Capped');
    const model = await boot({ envOverrides: { LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY: '0' } });

    const response = await post(target.id);

    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('SPEND_CAP_REACHED');
    expect(model.doGenerateCalls).toHaveLength(0);
    expect((await prisma.rateLimitCounter.findMany()).map((c) => c.count)).toEqual([0]);
  });

  it('AC-2.3.5 answers 502 GENERATION_FAILED after two invalid outputs, caches nothing and returns the slot', async () => {
    const target = await story('Invalid');
    const linked = { ...MODEL_OUTPUT, tldr: ['See https://example.com', 'two', 'three'] };
    const model = await boot({ doGenerate: async () => modelReply(linked) });

    const response = await post(target.id);

    expect(response.status).toBe(502);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('GENERATION_FAILED');
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(await prisma.summary.count()).toBe(0);
    expect((await prisma.rateLimitCounter.findMany()).map((c) => c.count)).toEqual([0]);
  });

  it('answers a guest POST without deviceId with 400', async () => {
    const target = await story('No device');
    await boot();

    const response = await post(target.id, { body: {} });

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
  });

  it('answers a foreign Origin with 403', async () => {
    const target = await story('Origin');
    await boot();

    const response = await request(app!.getHttpServer())
      .post(`/api/v1/stories/${target.id}/summary`)
      .set('Origin', 'https://evil.example')
      .send({ deviceId: DEVICE });

    expect(response.status).toBe(403);
  });

  it('answers 404 FEATURE_DISABLED while the flag is off', async () => {
    await boot({ envOverrides: { FEATURE_SUMMARIES: 'false' } });

    const response = await post(MISSING_ID);

    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('FEATURE_DISABLED');
  });

  it('answers 404 NOT_FOUND for an unknown story', async () => {
    await boot();

    const response = await post(MISSING_ID);

    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
  });

  it('limits one IP to 5 requests a minute with RateLimit headers', async () => {
    await boot();
    const ip = '198.51.100.251';

    const statuses: number[] = [];
    let last = await post(MISSING_ID, { ip });
    statuses.push(last.status);
    for (let index = 0; index < 5; index += 1) {
      last = await post(MISSING_ID, { ip });
      statuses.push(last.status);
    }

    expect(statuses).toEqual([404, 404, 404, 404, 404, 429]);
    expect(ApiErrorSchema.parse(last.body).error.code).toBe('RATE_LIMITED');
    expect(last.get('RateLimit-Limit')).toBe('5');
    expect(last.get('Retry-After')).toBeDefined();
  });
});
