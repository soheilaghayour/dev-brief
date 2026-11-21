import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger, type INestApplication } from '@nestjs/common';
import {
  A2uiServerMessageSchema,
  ApiErrorSchema,
  CopilotDoneEventSchema,
  CopilotErrorEventSchema,
  CopilotMetaEventSchema,
  EXAMPLE_QUESTIONS,
  type A2uiServerMessage,
} from '@devbrief/shared';
import { APICallError } from 'ai';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { loadEnv } from '../../src/env.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { BriefingRetrievalService } from '../../src/modules/copilot/briefingRetrieval.service.js';
import { CopilotService } from '../../src/modules/copilot/copilot.service.js';
import { noCoverageBriefing } from '../../src/modules/copilot/noCoverageBriefing.js';
import { copilotQuota } from '../../src/modules/copilot/copilotQuota.js';
import {
  mockStreamingModel,
  replayStream,
  streamParts,
  type StreamPart,
} from '../mockLanguageModel.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const COPILOT_ON = {
  FEATURE_COPILOT: 'true',
  ANTHROPIC_API_KEY: 'test-key',
  IP_HASH_SECRET: 'test-ip-hash-secret-0123456789abcdef',
  AUTH_TEST_MODE: 'true',
};
const env = loadEnv({ ...process.env, ...COPILOT_ON });
const QUESTION = "  What were THIS week's TypeScript tooling debates?? ";
const HOUR_MS = 3_600_000;

type Doc = { event: string; data: unknown } | { comment: string };

function parseSse(text: string): Doc[] {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith(':')) return { comment: block };
      const [event = '', data = ''] = block.split('\n');
      return {
        event: event.slice('event: '.length),
        data: JSON.parse(data.slice('data: '.length)),
      };
    });
}

const eventsOf = (text: string) => parseSse(text).flatMap((doc) => ('event' in doc ? [doc] : []));
const namesOf = (text: string) => eventsOf(text).map(({ event }) => event);
const messagesOf = (text: string) =>
  eventsOf(text).flatMap((doc) => (doc.event === 'a2ui' ? [doc.data as A2uiServerMessage] : []));
const metaOf = (text: string) =>
  CopilotMetaEventSchema.parse(eventsOf(text).find((doc) => doc.event === 'meta')?.data);

function deferred<VALUE>() {
  let resolve!: (value: VALUE | PromiseLike<VALUE>) => void;
  const promise = new Promise<VALUE>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** A plan of `count` one-tag sections, as the model would write it. */
function planText(count: number, title = 'TypeScript tooling this week') {
  const slugs = ['typescript', 'rust', 'go', 'python'];
  return {
    title,
    sections: Array.from({ length: count }, (_, index) => ({
      kind: 'tags',
      tags: [slugs[index % slugs.length]],
    })),
  };
}

/** A provider stream that delivers `parts` and then hangs until it is aborted, as a stalled connection does. */
function stalledStream(parts: readonly StreamPart[], abortSignal?: AbortSignal) {
  return {
    stream: new ReadableStream<StreamPart>({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        abortSignal?.addEventListener('abort', () => controller.error(abortSignal.reason), {
          once: true,
        });
      },
    }),
  };
}

const PLAN = planText(3);
const PLAN_TEXT = JSON.stringify(PLAN);
// The title is complete once a later key follows it; a section is complete once the next one starts.
const AFTER_TITLE = PLAN_TEXT.indexOf('[') + 12;
const AFTER_FIRST_SECTION = PLAN_TEXT.indexOf('},{') + 20;

/** The provider parts of the first `chars` characters of the plan's JSON text, with no finish part. */
function partialPlanParts(chars: number) {
  return streamParts(PLAN_TEXT.slice(0, chars), { chunkSize: 10_000 }).slice(0, 3);
}

/** A model that writes `chars` characters of the plan and then fails with a provider error. */
function streamThenError(chars: number) {
  return async () => ({
    stream: new ReadableStream<StreamPart>({
      start(controller) {
        for (const part of partialPlanParts(chars)) controller.enqueue(part);
        controller.enqueue({
          type: 'error',
          error: new APICallError({
            message: 'overloaded',
            url: 'https://api.anthropic.com/v1/messages',
            requestBodyValues: {},
            statusCode: 529,
          }),
        });
        controller.close();
      },
    }),
  });
}

/** A model that writes `chars` characters of the plan and then stalls until aborted; `onCall` sees the call's signal. */
function streamThenStall(
  chars: number,
  onCall: (signal: AbortSignal | undefined) => void = () => {},
) {
  return async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
    onCall(abortSignal);
    return stalledStream(partialPlanParts(chars), abortSignal);
  };
}

describe('POST /copilot/ask', () => {
  const prisma = useTestDatabase();
  let app: INestApplication | undefined;
  let model = mockStreamingModel(async () => {
    throw new Error('unscripted');
  });
  let clientCounter = 0;
  let sourceId = '';

  beforeEach(async () => {
    await prisma.llmUsage.deleteMany();
    await prisma.rateLimitCounter.deleteMany();
    await prisma.copilotQuery.deleteMany();
    await prisma.exampleBriefing.deleteMany();
    await prisma.story.deleteMany();
    await prisma.source.deleteMany();
    sourceId = (await createSource(prisma, 'hn', 'hn')).id;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
  });

  async function seedStories(count: number, tag = 'typescript') {
    for (let rank = 1; rank <= count; rank += 1) {
      await createStory(prisma, {
        title: `Compiler internals part ${rank}`,
        publishedAt: new Date(Date.now() - rank * HOUR_MS),
        rankScore: rank,
        tags: [tag],
        itemSourceIds: [sourceId],
      });
    }
  }

  async function boot({
    doStream = async (options: Parameters<typeof model.doStream>[0]) =>
      replayStream(streamParts(planText(2), { chunkSize: 30 }), options),
    envOverrides = {},
    listen = true,
  }: {
    doStream?: Parameters<typeof mockStreamingModel>[0];
    envOverrides?: Record<string, string>;
    listen?: boolean;
  } = {}) {
    model = mockStreamingModel(doStream);
    app = await createTestApp([], { ...COPILOT_ON, ...envOverrides }, { languageModel: model });
    if (listen) await app.listen(0);
    return app;
  }

  const freshIp = () => {
    clientCounter += 1;
    return `203.0.113.${clientCounter}`;
  };

  /** Posts `body` to the listening app on a raw socket, so a test can read the stream while it runs and hang up. */
  function ask(
    body: unknown,
    {
      ip = freshIp(),
      cookie = '',
      origin = env.APP_URL,
    }: { ip?: string; cookie?: string; origin?: string } = {},
  ) {
    const { port } = app!.getHttpServer().address() as AddressInfo;
    let text = '';
    const payload = JSON.stringify(body);
    const exchange = deferred<http.IncomingMessage>();
    const finished = deferred<void>();
    const outgoing = http.request(
      {
        port,
        method: 'POST',
        path: '/api/v1/copilot/ask',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Origin: origin,
          'X-Forwarded-For': ip,
          Cookie: cookie,
        },
      },
      (incoming) => {
        exchange.resolve(incoming);
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk: string) => {
          text += chunk;
        });
        incoming.on('end', () => finished.resolve());
        incoming.on('error', () => finished.resolve());
      },
    );
    outgoing.on('error', () => finished.resolve());
    outgoing.end(payload);
    return {
      get text() {
        return text;
      },
      response: exchange.promise,
      finished: finished.promise,
      hangUp: () => outgoing.destroy(),
      async complete() {
        const incoming = await exchange.promise;
        await finished.promise;
        return { status: incoming.statusCode, headers: incoming.headers, text };
      },
    };
  }

  const deviceBody = (question = QUESTION, deviceId = DEVICE) => ({ question, deviceId });
  const DEVICE = '4f0c1c1e-1b0a-4d27-9a38-3f1c2c0f9a11';
  const OTHER_DEVICE = '9a8b7c6d-1b0a-4d27-9a38-3f1c2c0f9a22';

  async function signIn() {
    const response = await request(app!.getHttpServer())
      .post('/api/auth/test/sign-in')
      .set('Origin', env.APP_URL)
      .set('X-Forwarded-For', freshIp())
      .send({ email: `copilot${clientCounter}@example.com` });
    expect(response.status).toBe(200);
    const cookie = (response.get('Set-Cookie') ?? []).map((c) => c.split(';')[0]).join('; ');
    return { cookie, userId: (response.body as { userId: string }).userId };
  }

  function counterFor(requester: Parameters<typeof copilotQuota>[0]) {
    const [first] = copilotQuota(requester, env.IP_HASH_SECRET ?? '', new Date()).counters;
    return prisma.rateLimitCounter.findFirst({ where: { key: first?.key } });
  }

  const guestOf = (ip: string, deviceId = DEVICE) => ({ kind: 'guest', ip, deviceId }) as const;

  /** Lets real I/O run: fake timers can't be used to wait for the database. */
  async function until(check: () => Promise<boolean> | boolean) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (await check()) return;
      await new Promise((resolve) => realSetTimeout(resolve, 25));
    }
    throw new Error('Condition not reached');
  }
  const realSetTimeout = globalThis.setTimeout;
  const pause = () => new Promise((resolve) => realSetTimeout(resolve, 50));

  it('streams meta, one a2ui message per event, then done, with the §6.4.2 headers and every payload schema-valid', async () => {
    await seedStories(4);
    await boot();

    const stream = ask(deviceBody());
    const { status, headers, text } = await stream.complete();

    expect(status).toBe(200);
    expect(headers['content-type']).toBe('text/event-stream');
    expect(headers['cache-control']).toBe('no-cache, no-transform');
    expect(headers['connection']).toBe('keep-alive');
    expect(headers['x-accel-buffering']).toBe('no');
    expect(headers['content-encoding']).toBeUndefined();
    expect(text.startsWith(': ping\n\n')).toBe(true);
    const events = eventsOf(text);
    const names = events.map(({ event }) => event);
    expect(names[0]).toBe('meta');
    expect(names.at(-1)).toBe('done');
    expect(new Set(names.slice(1, -1))).toEqual(new Set(['a2ui']));
    for (const { event, data } of events) {
      if (event === 'meta') CopilotMetaEventSchema.parse(data);
      if (event === 'a2ui') A2uiServerMessageSchema.parse(data);
      if (event === 'error') CopilotErrorEventSchema.parse(data);
      if (event === 'done') CopilotDoneEventSchema.parse(data);
    }
    expect(metaOf(text)).toMatchObject({ cached: false, quota: { limit: 3, remaining: 2 } });
  });

  it('stores a completed question with its messages, storyIds, tokens and cost', async () => {
    await seedStories(4);
    await boot();
    const ip = freshIp();

    const { text } = await ask(deviceBody(), { ip }).complete();

    const row = await prisma.copilotQuery.findFirstOrThrow();
    expect(row).toMatchObject({
      id: metaOf(text).queryId,
      status: 'complete',
      userId: null,
      inputTokens: 1_800,
      outputTokens: 240,
    });
    expect(row.question).toBe(QUESTION.trim());
    expect(row.messages).toEqual(messagesOf(text));
    expect(Number(row.costUsd)).toBeGreaterThan(0);
    expect(row.guestKey).toMatch(/^[0-9a-f]{64}$/);
    expect(row.guestKey).toBe(
      copilotQuota(guestOf(ip), env.IP_HASH_SECRET ?? '', new Date()).guestKey,
    );
    expect(row.guestKey).not.toContain(DEVICE);
  });

  it('gives the slot back, and answers 500, when the question row cannot be created', async () => {
    await seedStories(4);
    await boot();
    vi.spyOn(app!.get(PrismaService).copilotQuery, 'create').mockRejectedValueOnce(
      new Error('database down'),
    );
    const ip = freshIp();

    const { status } = await ask(deviceBody(), { ip }).complete();

    expect(status).toBe(500);
    expect((await counterFor(guestOf(ip)))?.count).toBe(0);
  });

  it('sends meta, then error INTERNAL, gives the slot back and logs once when something throws before the first event', async () => {
    await seedStories(4);
    await boot();
    vi.spyOn(app!.get(BriefingRetrievalService), 'retrieve').mockRejectedValueOnce(
      new Error('retrieval broke'),
    );
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const ip = freshIp();

    const { text } = await ask(deviceBody(), { ip }).complete();

    expect(namesOf(text)).toEqual(['meta', 'error']);
    expect(CopilotErrorEventSchema.parse(eventsOf(text)[1]?.data).code).toBe('INTERNAL');
    expect((await counterFor(guestOf(ip)))?.count).toBe(0);
    expect(await prisma.copilotQuery.findFirstOrThrow()).toMatchObject({ status: 'failed' });
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('files the model call under the copilot query id in the spend ledger', async () => {
    await seedStories(4);
    await boot();

    const { text } = await ask(deviceBody()).complete();

    const rows = await prisma.llmUsage.findMany({ where: { feature: 'copilot' } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(({ refId }) => refId === metaOf(text).queryId)).toBe(true);
  });

  it('AC-3.1.3 replays a question that normalises identically for free, with the stored row id and no model call', async () => {
    await seedStories(4);
    await boot();
    const ip = freshIp();
    const first = await ask(deviceBody(QUESTION), { ip }).complete();

    const second = await ask(deviceBody("what were this week's typescript tooling debates"), {
      ip,
    }).complete();

    expect(model.doStreamCalls).toHaveLength(1);
    expect(metaOf(second.text)).toMatchObject({
      cached: true,
      queryId: metaOf(first.text).queryId,
      quota: { remaining: 2 },
    });
    expect(messagesOf(second.text)).toEqual(messagesOf(first.text));
    expect(namesOf(second.text).at(-1)).toBe('done');
    expect(await prisma.copilotQuery.count()).toBe(1);
    expect((await counterFor(guestOf(ip)))?.count).toBe(1);
  });

  it('AC-3.1.3 generates fresh after 24 h, and never replays a failed, fallback, no_coverage or streaming row', async () => {
    await seedStories(4);
    await boot();
    const user = await signIn();
    await ask(deviceBody(), { cookie: user.cookie }).complete();
    const row = await prisma.copilotQuery.findFirstOrThrow();

    await prisma.copilotQuery.update({
      where: { id: row.id },
      data: { createdAt: new Date(Date.now() - 25 * HOUR_MS) },
    });
    const afterDay = await ask(deviceBody(), { cookie: user.cookie }).complete();
    expect(metaOf(afterDay.text).cached).toBe(false);
    expect(model.doStreamCalls).toHaveLength(2);

    for (const status of ['failed', 'fallback', 'no_coverage', 'streaming'] as const) {
      await prisma.copilotQuery.updateMany({ data: { status } });
      const again = await ask(deviceBody(), { cookie: user.cookie }).complete();
      expect(metaOf(again.text).cached, status).toBe(false);
    }
  });

  it('AC-3.1.7 answers fewer than 3 stories with the deterministic briefing, no model call and no quota', async () => {
    await seedStories(2);
    await boot();
    const ip = freshIp();

    const { text } = await ask(deviceBody(), { ip }).complete();

    expect(model.doStreamCalls).toHaveLength(0);
    expect(metaOf(text)).toMatchObject({
      cached: false,
      fallback: 'NO_COVERAGE',
      quota: { remaining: 3 },
    });
    expect(JSON.stringify(messagesOf(text))).toContain('Not enough coverage');
    expect(namesOf(text).at(-1)).toBe('done');
    expect((await counterFor(guestOf(ip)))?.count).toBe(0);
    const row = await prisma.copilotQuery.findFirstOrThrow();
    expect(row).toMatchObject({ status: 'no_coverage', id: metaOf(text).queryId });
    expect(await prisma.llmUsage.count()).toBe(0);
  });

  describe('quotas', () => {
    const questionNo = (index: number) => deviceBody(`TypeScript tooling question ${index}`);

    it('AC-3.1.4 answers the 4th guest question of a UTC day with 429 QUOTA_EXCEEDED, resetsAt and Retry-After', async () => {
      await seedStories(4);
      await boot();
      const ip = freshIp();
      for (let index = 1; index <= 3; index += 1) {
        const answered = await ask(questionNo(index), { ip }).complete();
        expect(answered.status).toBe(200);
      }

      const refused = await ask(questionNo(4), { ip }).complete();

      expect(refused.status).toBe(429);
      expect(refused.headers['content-type']).toContain('application/json');
      const { error } = ApiErrorSchema.parse(JSON.parse(refused.text));
      expect(error.code).toBe('QUOTA_EXCEEDED');
      const nextMidnight = new Date(Math.floor(Date.now() / 86_400_000 + 1) * 86_400_000);
      expect(error.resetsAt).toBe(nextMidnight.toISOString());
      expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
      expect(model.doStreamCalls).toHaveLength(3);
    });

    it('AC-3.1.4 answers an 11th question from one IP across device ids with 429, and gives back the device slot it took', async () => {
      await seedStories(4);
      await boot();
      const ip = freshIp();
      const [, ipCounter] = copilotQuota(
        guestOf(ip),
        env.IP_HASH_SECRET ?? '',
        new Date(),
      ).counters;
      await prisma.rateLimitCounter.create({
        data: {
          key: ipCounter!.key,
          day: copilotQuota(guestOf(ip), env.IP_HASH_SECRET ?? '', new Date()).day,
          count: 9,
        },
      });

      const tenth = await ask(deviceBody('TypeScript tooling question 10', DEVICE), {
        ip,
      }).complete();
      const eleventh = await ask(deviceBody('TypeScript tooling question 11', OTHER_DEVICE), {
        ip,
      }).complete();

      expect(tenth.status).toBe(200);
      expect(eleventh.status).toBe(429);
      expect(ApiErrorSchema.parse(JSON.parse(eleventh.text)).error.code).toBe('QUOTA_EXCEEDED');
      expect((await counterFor(guestOf(ip, OTHER_DEVICE)))?.count).toBe(0);
    });

    it('AC-3.1.4 answers the 21st question of a user with 429', async () => {
      await seedStories(4);
      await boot();
      const user = await signIn();
      const { counters, day } = copilotQuota(
        { kind: 'user', userId: user.userId },
        env.IP_HASH_SECRET ?? '',
        new Date(),
      );
      await prisma.rateLimitCounter.create({ data: { key: counters[0]!.key, day, count: 19 } });

      const twentieth = await ask(questionNo(20), { cookie: user.cookie }).complete();
      const twentyFirst = await ask(questionNo(21), { cookie: user.cookie }).complete();

      expect(twentieth.status).toBe(200);
      expect(metaOf(twentieth.text).quota).toMatchObject({ limit: 20, remaining: 0 });
      expect(twentyFirst.status).toBe(429);
    });

    it('AC-3.1.4 still streams a cached question after the limit', async () => {
      await seedStories(4);
      await boot();
      const ip = freshIp();
      for (let index = 1; index <= 3; index += 1) await ask(questionNo(index), { ip }).complete();

      const replayed = await ask(questionNo(2), { ip }).complete();

      expect(replayed.status).toBe(200);
      expect(metaOf(replayed.text)).toMatchObject({ cached: true, quota: { remaining: 0 } });
    });

    it('AC-3.1.4 answers a bad request before it takes a slot, and a limit of 5 a minute per IP with RATE_LIMITED', async () => {
      await seedStories(4);
      await boot();
      const ip = freshIp();
      for (let index = 1; index <= 5; index += 1) {
        await ask({ question: 'ab', deviceId: DEVICE }, { ip }).complete();
      }

      const sixth = await ask(questionNo(1), { ip }).complete();

      expect(sixth.status).toBe(429);
      expect(ApiErrorSchema.parse(JSON.parse(sixth.text)).error.code).toBe('RATE_LIMITED');
      expect(sixth.headers['ratelimit-limit']).toBe('5');
      expect(await prisma.rateLimitCounter.count()).toBe(0);
    });
  });

  describe('spend cap fallback', () => {
    async function seedExamples() {
      for (const [position, { slug, question }] of EXAMPLE_QUESTIONS.entries()) {
        await prisma.exampleBriefing.create({
          data: {
            slug,
            question,
            position,
            messages: noCoverageBriefing({
              question,
              suggestedTags: ['typescript'],
              surfaceId: `example-${slug}`,
            }) as unknown as Prisma.InputJsonValue,
          },
        });
      }
    }

    it.each([
      ['the copilot cap', { LLM_CAP_COPILOT_USD_DAY: '0.0001' }],
      ['only the global cap', { LLM_CAP_GLOBAL_USD_DAY: '0.0001' }],
    ])(
      'AC-3.1.5 replays the closest example with meta.fallback SPEND_CAP, no model call and the slot given back when %s is spent',
      async (_name, caps) => {
        await seedStories(4, 'rust');
        await seedExamples();
        await boot({ envOverrides: caps });
        const ip = freshIp();

        // The tag-matching example is the last one, so the pick is not simply position 0.
        const { status, text } = await ask(deviceBody('Is Rust still worth learning?'), {
          ip,
        }).complete();

        expect(status).toBe(200);
        expect(model.doStreamCalls).toHaveLength(0);
        expect(metaOf(text)).toMatchObject({
          cached: false,
          fallback: 'SPEND_CAP',
          quota: { remaining: 3 },
        });
        const closest = await prisma.exampleBriefing.findUniqueOrThrow({
          where: { slug: 'rust-vs-go' },
        });
        expect(messagesOf(text)).toEqual(closest.messages);
        expect(namesOf(text).at(-1)).toBe('done');
        expect((await counterFor(guestOf(ip)))?.count).toBe(0);
        expect(await prisma.copilotQuery.findFirstOrThrow()).toMatchObject({ status: 'fallback' });
      },
    );

    it('AC-3.1.5 skips a closest example that no longer parses and replays the next one, not an INTERNAL error', async () => {
      await seedStories(4, 'rust');
      await seedExamples();
      await prisma.exampleBriefing.update({
        where: { slug: 'rust-vs-go' },
        data: { messages: [{ notAnA2uiMessage: true }] },
      });
      await boot({ envOverrides: { LLM_CAP_COPILOT_USD_DAY: '0.0001' } });

      const { status, text } = await ask(deviceBody('Is Rust still worth learning?'), {
        ip: freshIp(),
      }).complete();

      expect(status).toBe(200);
      expect(metaOf(text)).toMatchObject({ fallback: 'SPEND_CAP' });
      expect(namesOf(text).at(-1)).toBe('done');
      const replayed = await prisma.exampleBriefing.findUniqueOrThrow({
        where: { slug: 'ts-tooling-debates' },
      });
      expect(messagesOf(text)).toEqual(replayed.messages);
    });

    it('AC-3.1.5 sends an error event SPEND_CAP_REACHED, and gives the slot back, when there is no example', async () => {
      await seedStories(4);
      await boot({ envOverrides: { LLM_CAP_COPILOT_USD_DAY: '0.0001' } });
      const ip = freshIp();

      const { text } = await ask(deviceBody(), { ip }).complete();

      expect(namesOf(text)).toEqual(['meta', 'error']);
      expect(CopilotErrorEventSchema.parse(eventsOf(text)[1]?.data).code).toBe('SPEND_CAP_REACHED');
      expect((await counterFor(guestOf(ip)))?.count).toBe(0);
    });
  });

  describe('failures after the stream started', () => {
    it('AC-3.1.8 keeps a section already sent, then sends error GENERATION_FAILED, stores failed, never replays it and keeps the slot used', async () => {
      await seedStories(4);
      await boot({ doStream: streamThenError(AFTER_FIRST_SECTION) });
      const ip = freshIp();

      const { text } = await ask(deviceBody(), { ip }).complete();

      const names = namesOf(text);
      expect(names.at(-1)).toBe('error');
      expect(names).not.toContain('done');
      const sections = messagesOf(text).filter(
        (message) =>
          'updateComponents' in message &&
          message.updateComponents.components.some((c) => c.id !== 'root'),
      );
      expect(sections.length).toBeGreaterThan(0);
      expect(CopilotErrorEventSchema.parse(eventsOf(text).at(-1)?.data).code).toBe(
        'GENERATION_FAILED',
      );
      expect(await prisma.copilotQuery.findFirstOrThrow()).toMatchObject({ status: 'failed' });
      expect((await counterFor(guestOf(ip)))?.count).toBe(1);

      const again = await ask(deviceBody(), { ip }).complete();
      expect(metaOf(again.text).cached).toBe(false);
    });

    it('AC-3.1.8 gives the slot back when the failure comes before any section, and sends no briefing message', async () => {
      await seedStories(4);
      await boot({
        doStream: async () => {
          throw new APICallError({
            message: 'bad request',
            url: 'https://api.anthropic.com/v1/messages',
            requestBodyValues: {},
            statusCode: 400,
          });
        },
      });
      const ip = freshIp();

      const { text } = await ask(deviceBody(), { ip }).complete();

      expect(namesOf(text)).toEqual(['meta', 'error']);
      expect(metaOf(text).quota.remaining).toBe(3);
      expect((await counterFor(guestOf(ip)))?.count).toBe(0);
      expect(await prisma.copilotQuery.findFirstOrThrow()).toMatchObject({ status: 'failed' });
    });

    it('gives the slot back when the failure comes after only the opening root, which is no component', async () => {
      await seedStories(4);
      await boot({ doStream: streamThenError(AFTER_TITLE) });
      const ip = freshIp();

      const { text } = await ask(deviceBody(), { ip }).complete();

      const names = namesOf(text);
      expect(names.filter((name) => name === 'a2ui')).toHaveLength(3);
      expect(names.at(-1)).toBe('error');
      expect((await counterFor(guestOf(ip)))?.count).toBe(0);
    });

    it('does not fail when the user deleted the account while the stream ran', async () => {
      await seedStories(4);
      const user = await signIn();
      await boot({
        doStream: async (options) => {
          await prisma.copilotQuery.deleteMany({ where: { userId: user.userId } });
          return replayStream(streamParts(planText(2), { chunkSize: 30 }), options);
        },
      });

      const { text } = await ask(deviceBody(), { cookie: user.cookie }).complete();

      expect(namesOf(text).at(-1)).toBe('done');
      expect(await prisma.copilotQuery.count()).toBe(0);
    });
  });

  describe('timing', () => {
    // Only the timers: Date stays real, because the quota and the cache read it.
    const useFakeTimers = () =>
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });

    it('AC-3.1.9 sends a : ping every 15 s and aborts a stream still running at 30 s with an error event', async () => {
      await seedStories(4);
      let aborted = false;
      // The title and one section arrive, so the first-token deadline is cleared; then the model stalls.
      await boot({
        doStream: streamThenStall(AFTER_FIRST_SECTION, (signal) =>
          signal?.addEventListener('abort', () => (aborted = true), { once: true }),
        ),
      });
      useFakeTimers();

      const stream = ask(deviceBody());
      await until(() => stream.text.includes('event: a2ui'));
      const pings = () => parseSse(stream.text).filter((doc) => 'comment' in doc).length;
      expect(pings()).toBe(1);

      await vi.advanceTimersByTimeAsync(14_999);
      await pause();
      expect(pings()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await until(() => pings() === 2);
      await vi.advanceTimersByTimeAsync(15_000);
      await until(() => pings() === 3);
      await stream.finished;

      expect(aborted).toBe(true);
      expect(namesOf(stream.text).at(-1)).toBe('error');
      expect(await prisma.llmUsage.count({ where: { status: 'reserved' } })).toBe(0);
      expect(await prisma.copilotQuery.findFirstOrThrow()).toMatchObject({ status: 'failed' });
    });

    it('AC-3.1.9 sends an error event, settles the ledger row and refunds the slot when no first token arrives within 10 s', async () => {
      await seedStories(4);
      await boot({ doStream: streamThenStall(0) });
      useFakeTimers();
      const ip = freshIp();

      const stream = ask(deviceBody(), { ip });
      await until(() => model.doStreamCalls.length === 1);
      await vi.advanceTimersByTimeAsync(9_999);
      await pause();
      expect(namesOf(stream.text)).not.toContain('error');
      await vi.advanceTimersByTimeAsync(1);
      await stream.finished;

      expect(namesOf(stream.text)).toEqual(['meta', 'error']);
      expect(await prisma.llmUsage.findMany()).toMatchObject([
        { feature: 'copilot', status: 'failed' },
      ]);
      expect((await counterFor(guestOf(ip)))?.count).toBe(0);
    });
  });

  describe('disconnects', () => {
    it('aborts the model call and stores failed, keeping the slot, when the client hangs up after a section', async () => {
      await seedStories(4);
      let signal: AbortSignal | undefined;
      await boot({ doStream: streamThenStall(AFTER_FIRST_SECTION, (called) => (signal = called)) });
      const ip = freshIp();

      const stream = ask(deviceBody(), { ip });
      await until(() => stream.text.includes('event: a2ui'));
      expect(signal?.aborted).toBe(false);
      stream.hangUp();

      await until(() => signal?.aborted === true);
      await until(async () => (await prisma.copilotQuery.findFirst())?.status === 'failed');
      expect((await counterFor(guestOf(ip)))?.count).toBe(1);
      expect(await prisma.llmUsage.count({ where: { status: 'reserved' } })).toBe(0);
    });

    it('aborts the model call and gives the slot back when the client hangs up before any section', async () => {
      await seedStories(4);
      let signal: AbortSignal | undefined;
      await boot({ doStream: streamThenStall(0, (called) => (signal = called)) });
      const ip = freshIp();

      const stream = ask(deviceBody(), { ip });
      await until(() => model.doStreamCalls.length === 1);
      stream.hangUp();

      await until(() => signal?.aborted === true);
      await until(async () => (await prisma.copilotQuery.findFirst())?.status === 'failed');
      await until(async () => (await counterFor(guestOf(ip)))?.count === 0);
    });
  });

  describe('a reader that leaves between two events', () => {
    /** Reads the stream through the service as the controller does, and stops after `count` events. */
    async function readAndLeave(count: number, ip: string) {
      await boot({ listen: false });
      const events = await app!
        .get(CopilotService)
        .ask({ ...deviceBody() }, { ip }, new AbortController().signal);
      const read: string[] = [];
      for await (const { event, data } of events) {
        read.push(event === 'a2ui' ? Object.keys(data)[1]! : event);
        if (read.length === count) break;
      }
      return read;
    }

    it('gives the slot back when it leaves after the opening root, which is no section', async () => {
      await seedStories(4);
      const ip = freshIp();

      const read = await readAndLeave(4, ip);

      expect(read).toEqual(['meta', 'createSurface', 'updateComponents', 'updateDataModel']);
      await until(async () => (await counterFor(guestOf(ip)))?.count === 0);
      expect(await prisma.copilotQuery.findFirstOrThrow()).toMatchObject({ status: 'failed' });
    });

    it('gives the slot back when it leaves with the first section in hand but never wrote it', async () => {
      await seedStories(4);
      const ip = freshIp();

      // The fifth event is the first section; the reader stops before asking for the next one.
      const read = await readAndLeave(5, ip);

      expect(read.slice(-1)).toEqual(['updateComponents']);
      await until(async () => (await prisma.copilotQuery.findFirst())?.status === 'failed');
      await until(async () => (await counterFor(guestOf(ip)))?.count === 0);
    });

    it('keeps the slot once the first section was written and the reader asked for more', async () => {
      await seedStories(4);
      const ip = freshIp();

      await readAndLeave(6, ip);

      await until(async () => (await prisma.copilotQuery.findFirst())?.status === 'failed');
      expect((await counterFor(guestOf(ip)))?.count).toBe(1);
    });
  });

  describe('guards', () => {
    it('answers a foreign Origin with 403 FORBIDDEN_ORIGIN, before anything is stored', async () => {
      await boot();

      const { status, text } = await ask(deviceBody(), {
        origin: 'https://evil.example',
      }).complete();

      expect(status).toBe(403);
      expect(ApiErrorSchema.parse(JSON.parse(text)).error.code).toBe('FORBIDDEN_ORIGIN');
      expect(await prisma.copilotQuery.count()).toBe(0);
    });

    it('answers a 2-character question with a JSON 400 VALIDATION_FAILED and takes no slot', async () => {
      await boot();

      const { status, headers, text } = await ask({ question: 'ab', deviceId: DEVICE }).complete();

      expect(status).toBe(400);
      expect(headers['content-type']).toContain('application/json');
      expect(ApiErrorSchema.parse(JSON.parse(text)).error.code).toBe('VALIDATION_FAILED');
      expect(await prisma.rateLimitCounter.count()).toBe(0);
    });

    it('answers a question of only punctuation with a JSON 400 VALIDATION_FAILED, as it has no cache key, and takes no slot', async () => {
      await boot();

      const { status, text } = await ask(deviceBody('???')).complete();

      expect(status).toBe(400);
      expect(ApiErrorSchema.parse(JSON.parse(text)).error.code).toBe('VALIDATION_FAILED');
      expect(await prisma.rateLimitCounter.count()).toBe(0);
      expect(await prisma.copilotQuery.count()).toBe(0);
    });

    it('does not share a cached answer between "C#" and "C", or "F#" and "F"', async () => {
      await seedStories(4);
      await boot();
      const ip = freshIp();
      await ask(deviceBody("What's new in TypeScript tooling and C#?"), { ip }).complete();

      const other = await ask(deviceBody("What's new in TypeScript tooling and C"), {
        ip,
      }).complete();

      expect(metaOf(other.text).cached).toBe(false);
      expect(model.doStreamCalls).toHaveLength(2);
    });

    it('answers 404 FEATURE_DISABLED before any other guard when the flag is off', async () => {
      await boot({ envOverrides: { FEATURE_COPILOT: 'false' } });

      const { status, text } = await ask(deviceBody(), {
        origin: 'https://evil.example',
      }).complete();

      expect(status).toBe(404);
      expect(ApiErrorSchema.parse(JSON.parse(text)).error.code).toBe('FEATURE_DISABLED');
    });
  });
});
