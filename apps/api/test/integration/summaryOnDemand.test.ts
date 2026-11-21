import type { INestApplication } from '@nestjs/common';
import {
  ApiErrorSchema,
  StoryDetailSchema,
  StoryLookupResponseSchema,
  StorySummarySchema,
} from '@devbrief/shared';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { summaryQuota } from '../../src/modules/summaries/summaryQuota.js';
import { mockLanguageModel, modelReply } from '../mockLanguageModel.js';
import { summaryFixtureFetch } from '../summaryFixtures.js';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import { createDiscussedStory, createSummaryCluster, SUMMARIES_ON } from './summariesTestModule.js';
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
  let devtoSourceId = '';
  let app: INestApplication | undefined;
  let ipCounter = 0;

  beforeAll(async () => {
    hnSourceId = (await createSource(prisma, 'hn', 'hn')).id;
    devtoSourceId = (await createSource(prisma, 'devto-od', 'devto')).id;
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

  it('AC-2.3.3 allows the 5th guest generation and rejects the next one', async () => {
    const first = await story('Boundary guest 1');
    const second = await story('Boundary guest 2');
    await boot();
    const ip = '198.51.100.251';
    const quota = summaryQuota(
      { kind: 'guest', ip, deviceId: DEVICE },
      env.IP_HASH_SECRET ?? '',
      new Date(),
    );
    await prisma.rateLimitCounter.create({ data: { key: quota.key, day: quota.day, count: 4 } });

    expect((await post(first.id, { ip })).status).toBe(201);
    expect((await post(second.id, { ip })).status).toBe(429);
    const counter = await prisma.rateLimitCounter.findFirstOrThrow({ where: { key: quota.key } });
    expect(counter.count).toBe(5);
  });

  it('AC-2.3.3 allows the 20th user generation and rejects the next one', async () => {
    const first = await story('Boundary user 1');
    const second = await story('Boundary user 2');
    await boot();
    const { cookie, userId } = await signIn();
    const quota = summaryQuota({ kind: 'user', userId }, env.IP_HASH_SECRET ?? '', new Date());
    await prisma.rateLimitCounter.create({ data: { key: quota.key, day: quota.day, count: 19 } });

    expect((await post(first.id, { cookie, body: {} })).status).toBe(201);
    expect((await post(second.id, { cookie, body: {} })).status).toBe(429);
  });

  it('AC-2.3.3 lets parallel first requests of the day share one counter without a 500', async () => {
    const stories = await Promise.all([
      story('Parallel 1'),
      story('Parallel 2'),
      story('Parallel 3'),
    ]);
    await boot();
    const ip = '198.51.100.252';

    const responses = await Promise.all(stories.map((target) => post(target.id, { ip })));

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
    const counters = await prisma.rateLimitCounter.findMany();
    expect(counters.map((counter) => counter.count)).toEqual([3]);
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

  const thinStory = (title: string) => {
    storyCounter += 1;
    return createDiscussedStory(prisma, {
      title,
      sourceId: hnSourceId,
      externalId: String(9_100_000 + storyCounter),
      commentsCount: 2,
    });
  };

  const lookupCards = async (ids: string[]) =>
    StoryLookupResponseSchema.parse(
      (
        await request(app!.getHttpServer())
          .post('/api/v1/stories/lookup')
          .set('Origin', process.env.APP_URL ?? '')
          .send({ ids })
      ).body,
    ).items;

  const getDetail = (storyId: string) =>
    request(app!.getHttpServer()).get(`/api/v1/stories/${storyId}`);

  it('AC-2.3.12 answers 404 NOT_FOUND for a story with too little to summarise, with no model call, fetch, usage row or quota', async () => {
    const thin = await thinStory('Thin');
    const model = await boot();

    const response = await post(thin.id);

    expect(response.status).toBe(404);
    const { error } = ApiErrorSchema.parse(response.body);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toMatch(/too little/);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await prisma.llmUsage.count()).toBe(0);
    expect(await prisma.summary.count()).toBe(0);
    expect(await prisma.rateLimitCounter.count()).toBe(0);
  });

  it('AC-2.3.12 still returns a cached summary of a story with too little input', async () => {
    const thin = await thinStory('Thin cached');
    await boot();
    await prisma.summary.create({
      data: {
        storyId: thin.id,
        tldr: ['a', 'b', 'c'],
        basedOnComments: 2,
        trigger: 'auto',
        model: 'claude-haiku-5-5',
        promptVersion: 1,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: '0.000001',
      },
    });

    expect((await post(thin.id)).status).toBe(200);
  });

  it('AC-2.3.12 summarises a story with exactly 3 comments, and a Dev.to article with none', async () => {
    storyCounter += 1;
    const threeComments = await createDiscussedStory(prisma, {
      title: 'Three comments',
      sourceId: hnSourceId,
      externalId: String(9_200_000 + storyCounter),
      commentsCount: 3,
    });
    const article = await createDiscussedStory(prisma, {
      title: 'Article only',
      sourceId: devtoSourceId,
      externalId: '5075072',
      commentsCount: 0,
    });
    await boot();

    expect((await post(threeComments.id)).status).toBe(201);
    expect((await post(article.id)).status).toBe(201);
  });

  it('AC-2.3.12 carries canSummarize on the story detail, and leaves it out with the flag off', async () => {
    const thin = await thinStory('Detail thin');
    const talked = await story('Detail talked');
    const article = await createDiscussedStory(prisma, {
      title: 'Detail article',
      sourceId: devtoSourceId,
      externalId: '5075073',
      commentsCount: 0,
    });
    await boot();

    const canSummarize = async (id: string) =>
      StoryDetailSchema.parse((await getDetail(id)).body).canSummarize;

    expect(await canSummarize(thin.id)).toBe(false);
    expect(await canSummarize(talked.id)).toBe(true);
    expect(await canSummarize(article.id)).toBe(true);

    const cards = await lookupCards([thin.id, talked.id, article.id]);
    expect(cards.map((card) => [card.id, card.canSummarize])).toEqual([
      [thin.id, false],
      [talked.id, true],
      [article.id, true],
    ]);

    await app!.close();
    await boot({ envOverrides: { FEATURE_SUMMARIES: 'false' } });
    const off = StoryDetailSchema.parse((await getDetail(talked.id)).body);
    expect(off).not.toHaveProperty('canSummarize');
    const [offCard] = (
      await request(app!.getHttpServer())
        .post('/api/v1/stories/lookup')
        .set('Origin', process.env.APP_URL ?? '')
        .send({ ids: [talked.id] })
    ).body.items;
    expect(offCard).not.toHaveProperty('canSummarize');
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

describe('on-demand cluster summaries', () => {
  const prisma = useTestDatabase();
  let hnSourceId = '';
  let devtoSourceId = '';
  let app: INestApplication | undefined;
  let ipCounter = 0;

  beforeAll(async () => {
    hnSourceId = (await createSource(prisma, 'hn-cluster-od', 'hn')).id;
    devtoSourceId = (await createSource(prisma, 'devto-cluster-od', 'devto')).id;
  });

  beforeEach(async () => {
    await prisma.llmUsage.deleteMany();
    await prisma.rateLimitCounter.deleteMany();
    await prisma.story.deleteMany();
    await prisma.cluster.deleteMany();
  });

  afterEach(() => app?.close());

  async function boot() {
    const model = mockLanguageModel(async () => {
      // A pause long enough for concurrent requests to arrive while the first generation is in flight.
      await new Promise((resolve) => setTimeout(resolve, 100));
      return modelReply(MODEL_OUTPUT);
    });
    const upstream = summaryFixtureFetch({ hnFallbackId: RECORDED_THREAD_ID });
    app = await createTestApp(
      [],
      { ...SUMMARIES_ON, FEATURE_CLUSTERS: 'true' },
      { languageModel: model, upstreamFetch: upstream.fetch },
    );
    return { model, requests: upstream.requests };
  }

  function post(storyId: string) {
    ipCounter += 1;
    return request(app!.getHttpServer())
      .post(`/api/v1/stories/${storyId}/summary`)
      .set('Origin', env.APP_URL)
      .set('X-Forwarded-For', `203.0.113.${ipCounter}`)
      .send({ deviceId: DEVICE });
  }

  const seedCluster = () =>
    createSummaryCluster(prisma, {
      hnSourceId,
      devtoSourceId,
      members: [
        { title: 'OD rep', rankScore: 9, items: [{ kind: 'hn', externalId: '50544168' }] },
        { title: 'OD member B', rankScore: 5, items: [{ kind: 'devto', externalId: '5075072' }] },
        { title: 'OD member C', rankScore: 3, items: [{ kind: 'hn', externalId: '888' }] },
      ],
    });

  let memberCounter = 0;
  // A cluster of `size` members, each with one HN item of its own.
  const seedClusterOf = (size: number) =>
    createSummaryCluster(prisma, {
      hnSourceId,
      devtoSourceId,
      members: Array.from({ length: size }, (_, index) => {
        memberCounter += 1;
        return {
          title: `OD generated ${memberCounter}`,
          rankScore: size - index,
          items: [{ kind: 'hn' as const, externalId: String(7_000_000 + memberCounter) }],
        };
      }),
    });

  it('AC-2.3.12 F2.3 Clusters sums the comments of every member for canSummarize, and for the POST 404', async () => {
    const enough = await createSummaryCluster(prisma, {
      hnSourceId,
      devtoSourceId,
      members: [
        {
          title: 'OD sum rep',
          rankScore: 3,
          items: [{ kind: 'hn', externalId: '6001', commentsCount: 2 }],
        },
        {
          title: 'OD sum member',
          rankScore: 2,
          items: [{ kind: 'hn', externalId: '6002', commentsCount: 1 }],
        },
      ],
    });
    const short = await createSummaryCluster(prisma, {
      hnSourceId,
      devtoSourceId,
      members: [
        {
          title: 'OD short rep',
          rankScore: 1,
          items: [{ kind: 'hn', externalId: '6003', commentsCount: 1 }],
        },
        {
          title: 'OD short member',
          rankScore: 0,
          items: [{ kind: 'hn', externalId: '6004', commentsCount: 1 }],
        },
      ],
    });
    const { model } = await boot();
    const canSummarize = async (id: string) =>
      StoryDetailSchema.parse(
        (await request(app!.getHttpServer()).get(`/api/v1/stories/${id}`)).body,
      ).canSummarize;

    expect(await Promise.all(enough.ids.map(canSummarize))).toEqual([true, true]);
    expect(await Promise.all(short.ids.map(canSummarize))).toEqual([false, false]);
    // The cards of a feed carry the cluster-wide answer too.
    const cards = StoryLookupResponseSchema.parse(
      (
        await request(app!.getHttpServer())
          .post('/api/v1/stories/lookup')
          .set('Origin', process.env.APP_URL ?? '')
          .send({ ids: [...enough.ids, ...short.ids] })
      ).body,
    ).items;
    expect(cards.map((card) => card.canSummarize)).toEqual([true, true, false, false]);
    for (const id of short.ids) expect((await post(id)).status).toBe(404);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("AC-2.3.1 F2.3 Clusters answers 200 with member B's summary, no LLM call and no fetch, when member A is asked", async () => {
    const { ids } = await seedCluster();
    const { model, requests } = await boot();
    await prisma.summary.create({
      data: {
        storyId: ids[1]!,
        tldr: MODEL_OUTPUT.tldr,
        basedOnComments: 12,
        trigger: 'auto',
        model: 'claude-haiku-5-5',
        promptVersion: 1,
        inputTokens: 1,
        outputTokens: 1,
        costUsd: '0.0003',
      },
    });

    const response = await post(ids[0]!);

    expect(response.status).toBe(200);
    expect(StorySummarySchema.parse(response.body).storyId).toBe(ids[1]);
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(requests).toHaveLength(0);
    expect(await prisma.rateLimitCounter.count({ where: { count: { gt: 0 } } })).toBe(0);
  });

  it("F2.3 Clusters answers 201 with the representative's id for a member, then 200 cached for every member", async () => {
    const { ids } = await seedCluster();
    const { model } = await boot();

    const created = await post(ids[2]!);
    expect(created.status).toBe(201);
    expect(StorySummarySchema.parse(created.body).storyId).toBe(ids[0]);

    for (const id of ids) {
      const again = await post(id);
      expect(again.status).toBe(200);
      expect(StorySummarySchema.parse(again.body)).toEqual(created.body);
    }
    expect(model.doGenerateCalls).toHaveLength(1);
    expect((await prisma.summary.findMany()).map((row) => row.storyId)).toEqual([ids[0]]);
  });

  it('F2.3 Clusters creates exactly one Summary and at most one LLM call for two concurrent POSTs for two members', async () => {
    const { ids } = await seedCluster();
    const { model } = await boot();

    const [first, second] = await Promise.all([post(ids[1]!), post(ids[2]!)]);

    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(first.body).toEqual(second.body);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(await prisma.summary.count()).toBe(1);
    // The request that found the summary stored gave its quota slot back.
    const used = await prisma.rateLimitCounter.aggregate({ _sum: { count: true } });
    expect(used._sum.count).toBe(1);
  });

  it('F2.3 Clusters gives 1 Summary, 1 LLM call, one 201 and four 200s with their quota returned for 5 concurrent POSTs for members of one cluster', async () => {
    const { ids } = await seedClusterOf(5);
    const { model } = await boot();

    const responses = await Promise.all(ids.map((id) => post(id)));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(await prisma.summary.count()).toBe(1);
    const used = await prisma.rateLimitCounter.aggregate({ _sum: { count: true } });
    expect(used._sum.count).toBe(1);
  });

  it('F2.3 Clusters finishes 12 concurrent generations for 12 clusters with no error, while feed requests keep answering', async () => {
    const clusters = [];
    for (let index = 0; index < 12; index += 1) clusters.push(await seedClusterOf(2));
    await boot();
    const started = Date.now();

    const generating = Promise.all(clusters.map(({ ids }) => post(ids[1]!)));
    // The generations are mid-flight (the model takes 100 ms) when the feed is asked.
    await new Promise((resolve) => setTimeout(resolve, 40));
    const feeds = await Promise.all(
      Array.from({ length: 5 }, () => request(app!.getHttpServer()).get('/api/v1/feed')),
    );
    const responses = await generating;

    expect(feeds.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(responses.map((response) => response.status)).toEqual(Array(12).fill(201));
    expect(await prisma.summary.count()).toBe(12);
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
