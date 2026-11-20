import type { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import {
  ApiErrorSchema,
  FeedPageSchema,
  StoryDetailSchema,
  StoryLookupResponseSchema,
  StorySummarySchema,
} from '@devbrief/shared';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { utcDay } from '../../src/modules/llm/budget.js';
import { GenerationFailedError } from '../../src/modules/llm/llm.errors.js';
import { SummariesService } from '../../src/modules/summaries/summaries.service.js';
import { SummaryInputsUnavailableError } from '../../src/modules/summaries/summaries.errors.js';
import { modelReply, RECORDED_USAGE } from '../mockLanguageModel.js';
import { createTestApp } from './createTestApp.js';
import { createSource } from './seedStories.js';
import {
  createDiscussedStory,
  createSummariesModule,
  promptOf,
  SUMMARIES_ON,
} from './summariesTestModule.js';
import { useTestDatabase } from './testDatabase.js';

const MISSING_ID = 'cmissingmissingmissing0000';

const MODEL_OUTPUT = {
  tldr: [
    'Designated initializers let C callers name their arguments.',
    'A macro wraps a struct literal, so omitted fields default to zero.',
    'Commenters weigh clearer call sites against ABI and default-value limits.',
  ],
  consensus: { verdict: 'mixed', pros: ['Clear call sites.'], cons: ['Only zero defaults.'] },
};

describe('summary generator', () => {
  const prisma = useTestDatabase();
  let hnSourceId = '';
  let devtoSourceId = '';
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    hnSourceId = (await createSource(prisma, 'hn', 'hn')).id;
    devtoSourceId = (await createSource(prisma, 'devto', 'devto')).id;
  });

  beforeEach(async () => {
    await prisma.llmUsage.deleteMany();
    await prisma.story.deleteMany();
  });

  afterEach(() => moduleRef?.close());

  async function generator(options: Parameters<typeof createSummariesModule>[0]) {
    const created = await createSummariesModule(options);
    moduleRef = created.moduleRef;
    return { ...created, summaries: created.moduleRef.get(SummariesService) };
  }

  it('F2.3 builds the summary from the HN thread, stores it and records its cost', async () => {
    const story = await createDiscussedStory(prisma, { title: 'Named args', sourceId: hnSourceId });
    const { summaries, model } = await generator({
      doGenerate: async () => modelReply(MODEL_OUTPUT),
    });

    const result = await summaries.generate(story.id, 'on_demand', { userId: 'user-1' });

    expect(result.kind).toBe('created');
    const summary = StorySummarySchema.parse(result.summary);
    expect(summary).toMatchObject({
      storyId: story.id,
      tldr: MODEL_OUTPUT.tldr,
      model: 'claude-haiku-5-5',
    });
    const prompt = promptOf(model.doGenerateCalls[0]!);
    expect(prompt).toContain('<source id=\\"title\\">\\nNamed args');
    expect(prompt).toContain("I always thought Amiga's");

    const row = await prisma.summary.findUniqueOrThrow({ where: { storyId: story.id } });
    expect(row).toMatchObject({
      trigger: 'on_demand',
      promptVersion: 1,
      inputTokens: RECORDED_USAGE.inputTokens,
      outputTokens: RECORDED_USAGE.outputTokens,
    });
    expect(row.costUsd.toString()).toBe('0.0003');
    expect(row.basedOnComments).toBeGreaterThanOrEqual(5);
    expect(summary.consensus).toEqual({
      ...MODEL_OUTPUT.consensus,
      basedOnComments: row.basedOnComments,
    });
    expect(await prisma.llmUsage.findMany()).toMatchObject([
      { feature: 'summary_on_demand', status: 'settled', userId: 'user-1', refId: story.id },
    ]);
  });

  it('F2.3 Cached forever: a story with a summary returns it with no LLM call and no upstream fetch', async () => {
    const story = await createDiscussedStory(prisma, { title: 'Cached', sourceId: hnSourceId });
    const first = await generator({ doGenerate: async () => modelReply(MODEL_OUTPUT) });
    const created = await first.summaries.generate(story.id, 'auto');
    await first.moduleRef.close();

    const { summaries, model, upstreamRequests } = await generator({
      doGenerate: async () => modelReply(MODEL_OUTPUT),
    });
    const again = await summaries.generate(story.id, 'on_demand');

    expect(again).toEqual({ kind: 'cached', summary: created.summary });
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(upstreamRequests).toHaveLength(0);
    expect(await prisma.summary.count()).toBe(1);
  });

  it('F2.3 stores no consensus when fewer than 5 comments went in, even when the model returns one', async () => {
    // The recorded Dev.to article has 4 comments.
    const story = await createDiscussedStory(prisma, {
      title: 'Agent code in a sandbox',
      sourceId: devtoSourceId,
      externalId: '5075072',
      commentsCount: 4,
    });
    const { summaries, upstreamRequests } = await generator({
      doGenerate: async () => modelReply(MODEL_OUTPUT),
    });

    const { summary } = await summaries.generate(story.id, 'on_demand');

    expect(summary.consensus).toBeNull();
    const row = await prisma.summary.findUniqueOrThrow({ where: { storyId: story.id } });
    expect(row).toMatchObject({ basedOnComments: 4, consensus: null });
    expect(upstreamRequests.sort()).toEqual([
      'https://dev.to/api/articles/5075072',
      'https://dev.to/api/comments?a_id=5075072',
    ]);
  });

  it('writes no summary and calls no model when the Algolia fetch fails', async () => {
    const story = await createDiscussedStory(prisma, { title: 'Down', sourceId: hnSourceId });
    const { summaries, model } = await generator({
      doGenerate: async () => modelReply(MODEL_OUTPUT),
      fixtures: { failing: ['hn.algolia.com'] },
    });

    await expect(summaries.generate(story.id, 'on_demand')).rejects.toBeInstanceOf(
      SummaryInputsUnavailableError,
    );
    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await prisma.summary.count()).toBe(0);
    expect(await prisma.llmUsage.count()).toBe(0);
  });

  it('writes no summary when the output fails validation twice', async () => {
    const story = await createDiscussedStory(prisma, { title: 'Invalid', sourceId: hnSourceId });
    const linked = { ...MODEL_OUTPUT, tldr: ['See https://example.com', 'two', 'three'] };
    const { summaries, model } = await generator({ doGenerate: async () => modelReply(linked) });

    const failure = summaries.generate(story.id, 'on_demand');

    await expect(failure).rejects.toBeInstanceOf(GenerationFailedError);
    await expect(failure).rejects.toMatchObject({ reason: 'invalid_output' });
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(await prisma.summary.count()).toBe(0);
  });

  it('returns the summary a concurrent call stored first as cached', async () => {
    const story = await createDiscussedStory(prisma, { title: 'Raced', sourceId: hnSourceId });
    const { summaries } = await generator({
      doGenerate: async () => {
        // Another request stores its summary while this call waits for the model.
        await prisma.summary.create({
          data: {
            storyId: story.id,
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
        return modelReply(MODEL_OUTPUT);
      },
    });

    const result = await summaries.generate(story.id, 'on_demand');

    expect(result).toMatchObject({ kind: 'cached', summary: { tldr: ['a', 'b', 'c'] } });
    expect(await prisma.summary.count()).toBe(1);
  });

  it('answers NOT_FOUND for an unknown story', async () => {
    const { summaries } = await generator({ doGenerate: async () => modelReply(MODEL_OUTPUT) });

    await expect(summaries.generate(MISSING_ID, 'on_demand')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('summary reads', () => {
  const prisma = useTestDatabase();
  let flagOn: INestApplication;
  let flagOff: INestApplication;
  let summarisedId = '';
  let plainId = '';

  beforeAll(async () => {
    const hn = await createSource(prisma, 'hn-reads', 'hn');
    const summarised = await createDiscussedStory(prisma, { title: 'Summarised', sourceId: hn.id });
    const plain = await createDiscussedStory(prisma, { title: 'Plain', sourceId: hn.id });
    summarisedId = summarised.id;
    plainId = plain.id;
    await prisma.summary.create({
      data: {
        storyId: summarisedId,
        tldr: MODEL_OUTPUT.tldr,
        consensus: { ...MODEL_OUTPUT.consensus, basedOnComments: 12 },
        basedOnComments: 12,
        trigger: 'auto',
        model: 'claude-haiku-5-5',
        promptVersion: 1,
        inputTokens: 1_800,
        outputTokens: 240,
        costUsd: '0.0003',
        createdAt: utcDay(new Date()),
      },
    });
    flagOn = await createTestApp([], SUMMARIES_ON);
    flagOff = await createTestApp();
  });

  afterAll(async () => {
    await flagOn.close();
    await flagOff.close();
  });

  const get = (app: INestApplication, path: string) => request(app.getHttpServer()).get(path);
  const lookup = (app: INestApplication) =>
    request(app.getHttpServer())
      .post('/api/v1/stories/lookup')
      .set('Origin', process.env.APP_URL ?? '')
      .send({ ids: [summarisedId, plainId] });

  it('GET /stories/:id/summary returns the stored summary with the public cache headers', async () => {
    const response = await get(flagOn, `/api/v1/stories/${summarisedId}/summary`);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    expect(StorySummarySchema.parse(response.body)).toEqual({
      storyId: summarisedId,
      tldr: MODEL_OUTPUT.tldr,
      consensus: { ...MODEL_OUTPUT.consensus, basedOnComments: 12 },
      model: 'claude-haiku-5-5',
      createdAt: utcDay(new Date()).toISOString(),
    });
  });

  it('GET /stories/:id/summary answers 404 NOT_FOUND without a summary or a story, and 400 for a bad id', async () => {
    for (const id of [plainId, MISSING_ID]) {
      const response = await get(flagOn, `/api/v1/stories/${id}/summary`);
      expect(response.status).toBe(404);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    }
    const invalid = await get(flagOn, '/api/v1/stories/not-a-cuid/summary');
    expect(invalid.status).toBe(400);
  });

  it('GET /stories/:id/summary answers 404 FEATURE_DISABLED with the flag off', async () => {
    const response = await get(flagOff, `/api/v1/stories/${summarisedId}/summary`);

    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('FEATURE_DISABLED');
  });

  it('feed, lookup and story detail carry hasSummary and the detail its summary with the flag on', async () => {
    const feed = FeedPageSchema.parse((await get(flagOn, '/api/v1/feed?sort=new')).body);
    const hasSummaryById = Object.fromEntries(feed.items.map((card) => [card.id, card.hasSummary]));
    expect(hasSummaryById).toEqual({ [summarisedId]: true, [plainId]: false });

    const { items } = StoryLookupResponseSchema.parse((await lookup(flagOn)).body);
    expect(items.map((card) => card.hasSummary)).toEqual([true, false]);

    const detail = StoryDetailSchema.parse(
      (await get(flagOn, `/api/v1/stories/${summarisedId}`)).body,
    );
    expect(detail).toMatchObject({ hasSummary: true, summary: { tldr: MODEL_OUTPUT.tldr } });
    const plain = StoryDetailSchema.parse((await get(flagOn, `/api/v1/stories/${plainId}`)).body);
    expect(plain).toMatchObject({ hasSummary: false, summary: null });
  });

  it('feed, lookup and story detail leave both fields out with the flag off', async () => {
    const feed = await get(flagOff, '/api/v1/feed?sort=new');
    FeedPageSchema.parse(feed.body);
    expect(feed.body.items[0]).not.toHaveProperty('hasSummary');

    const lookupBody = (await lookup(flagOff)).body;
    StoryLookupResponseSchema.parse(lookupBody);
    expect(lookupBody.items[0]).not.toHaveProperty('hasSummary');

    const detail = (await get(flagOff, `/api/v1/stories/${summarisedId}`)).body;
    StoryDetailSchema.parse(detail);
    expect(detail).not.toHaveProperty('hasSummary');
    expect(detail).not.toHaveProperty('summary');
  });
});
