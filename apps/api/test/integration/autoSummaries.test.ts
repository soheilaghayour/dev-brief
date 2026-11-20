import type { TestingModule } from '@nestjs/testing';
import { APICallError } from 'ai';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { LLM_CAP_SUMMARY_AUTO_USD_DAY, utcDay } from '../../src/modules/llm/budget.js';
import { AutoSummariesStep } from '../../src/modules/summaries/autoSummaries.step.js';
import { AUTO_ATTEMPTS_PER_RUN } from '../../src/modules/summaries/summaryRules.js';
import { modelReply } from '../mockLanguageModel.js';
import { createSource } from './seedStories.js';
import {
  createDiscussedStory,
  createSummariesModule,
  promptOf,
  SUMMARIES_ON,
} from './summariesTestModule.js';
import { useTestDatabase } from './testDatabase.js';

const AUTO_ON = { ...SUMMARIES_ON, AUTO_SUMMARIES: 'true' };
const DAY_MS = 86_400_000;

const MODEL_OUTPUT = {
  tldr: ['First point.', 'Second point.', 'Third point.'],
  consensus: { verdict: 'mostly_positive', pros: ['Useful.'], cons: [] },
};

describe('auto summaries', () => {
  const prisma = useTestDatabase();
  let sourceId = '';
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    sourceId = (await createSource(prisma, 'hn', 'hn')).id;
  });

  beforeEach(async () => {
    await prisma.llmUsage.deleteMany();
    await prisma.story.deleteMany();
  });

  afterEach(() => moduleRef?.close());

  async function createIngestion(
    options: Partial<Parameters<typeof createSummariesModule>[0]> = {},
  ) {
    const created = await createSummariesModule({
      doGenerate: async () => modelReply(MODEL_OUTPUT),
      env: AUTO_ON,
      // Every story's HN item is served the recorded 46-comment thread.
      fixtures: { hnFallbackId: '50544168', ...options.fixtures },
      ...options,
    });
    moduleRef = created.moduleRef;
    return { ...created, ingestion: created.moduleRef.get(IngestionService) };
  }

  function storiesSummarised(model: { doGenerateCalls: Parameters<typeof promptOf>[0][] }) {
    return model.doGenerateCalls.map((call) => /Story (\w+)/.exec(promptOf(call))?.[1]);
  }

  async function createStories(count: number, overrides: { commentsCount?: number } = {}) {
    for (let index = 0; index < count; index++) {
      await createDiscussedStory(prisma, {
        title: `Story s${index}`,
        sourceId,
        externalId: String(1_000 + index),
        rankScore: count - index,
        ...overrides,
      });
    }
  }

  it('F2.3 Auto summarises the eligible Top stories after a run, in rankScore order', async () => {
    const story = (
      title: string,
      rankScore: number,
      more: { commentsCount?: number; publishedAt?: Date } = {},
    ) =>
      createDiscussedStory(prisma, {
        title,
        sourceId,
        rankScore,
        externalId: String(rankScore),
        ...more,
      });
    await story('Story low', 1);
    await story('Story high', 3, { commentsCount: 10 });
    await story('Story middle', 2);
    // 9 comments in total is one short of the threshold, whatever its rank.
    await story('Story nine', 9, { commentsCount: 9 });
    // Older than the 7-day Top window.
    await story('Story old', 8, { publishedAt: new Date(Date.now() - 8 * DAY_MS) });
    const { ingestion, model } = await createIngestion();

    await ingestion.run();

    expect(storiesSummarised(model)).toEqual(['high', 'middle', 'low']);
    const summarised = await prisma.summary.findMany({ include: { story: true } });
    expect(summarised.map((summary) => summary.story.title).sort()).toEqual([
      'Story high',
      'Story low',
      'Story middle',
    ]);
    expect(summarised.every((summary) => summary.trigger === 'auto')).toBe(true);
    expect(await prisma.llmUsage.findMany({ select: { feature: true } })).toEqual(
      Array(3).fill({ feature: 'summary_auto' }),
    );
  });

  it('F2.3 Auto stops at 20 auto summaries for the UTC day, and a second run makes no LLM call', async () => {
    await createStories(23);
    const first = await createIngestion();

    await first.ingestion.run();

    expect(first.model.doGenerateCalls).toHaveLength(20);
    expect(await prisma.summary.count({ where: { trigger: 'auto' } })).toBe(20);
    await first.moduleRef.close();

    const second = await createIngestion();
    await second.ingestion.run();

    expect(second.model.doGenerateCalls).toHaveLength(0);
    expect(await prisma.summary.count()).toBe(20);
  });

  it("F2.3 Auto counts only today's auto summaries toward the 20", async () => {
    await createStories(25);
    // 19 auto summaries from today, one from yesterday and one on-demand one today.
    const stories = await prisma.story.findMany({ orderBy: { rankScore: 'asc' }, take: 21 });
    for (const [index, story] of stories.entries()) {
      await prisma.summary.create({
        data: {
          storyId: story.id,
          tldr: ['a', 'b', 'c'],
          basedOnComments: 46,
          trigger: index === 20 ? 'on_demand' : 'auto',
          model: 'claude-haiku-5-5',
          promptVersion: 1,
          inputTokens: 1,
          outputTokens: 1,
          costUsd: '0.000001',
          createdAt: index === 19 ? new Date(utcDay(new Date()).getTime() - 1) : new Date(),
        },
      });
    }
    const { ingestion, model } = await createIngestion();

    await ingestion.run();

    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('F2.3 Auto makes no LLM call once the summary_auto cap is spent', async () => {
    await createStories(2);
    await prisma.llmUsage.create({
      data: {
        day: utcDay(new Date()),
        feature: 'summary_auto',
        model: 'claude-haiku-5-5',
        status: 'settled',
        reservedUsd: LLM_CAP_SUMMARY_AUTO_USD_DAY.toFixed(6),
        costUsd: LLM_CAP_SUMMARY_AUTO_USD_DAY.toFixed(6),
      },
    });
    const { ingestion, model } = await createIngestion();

    const { status } = await ingestion.run();

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await prisma.summary.count()).toBe(0);
    expect(status).toBe('skipped');
  });

  it("moves on to the next story when one story's thread is gone or its output fails validation", async () => {
    await createStories(3);
    const { ingestion, model } = await createIngestion({
      // s0 (rank 3) answers 404; s1 (rank 2) gets output that fails validation twice.
      fixtures: { hnFallbackId: '50544168', missing: ['/items/1000'] },
      doGenerate: async (options) =>
        promptOf(options).includes('Story s1')
          ? modelReply({ ...MODEL_OUTPUT, tldr: ['<b>bold</b>', 'two', 'three'] })
          : modelReply(MODEL_OUTPUT),
    });

    await ingestion.run();

    expect(storiesSummarised(model)).toEqual(['s1', 's1', 's2']);
    const summarised = await prisma.summary.findMany({ include: { story: true } });
    expect(summarised.map((summary) => summary.story.title)).toEqual(['Story s2']);
  });

  it('stops the step after the first story when HN Algolia fails, so an outage costs one story of requests', async () => {
    await createStories(30);
    const { ingestion, model, upstreamRequests } = await createIngestion({
      fixtures: { failing: ['hn.algolia.com'] },
    });

    await ingestion.run();

    // One request and its 2 retries, all for the top story.
    expect(upstreamRequests).toEqual(Array(3).fill('https://hn.algolia.com/api/v1/items/1000'));
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('stops the step after one call when the provider answers 4xx, which the spend cap never sees', async () => {
    await createStories(5);
    const { ingestion, model } = await createIngestion({
      doGenerate: async () => {
        throw new APICallError({
          message: 'invalid x-api-key',
          url: 'https://api.anthropic.com/v1/messages',
          requestBodyValues: {},
          statusCode: 401,
        });
      },
    });

    await ingestion.run();

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(await prisma.summary.count()).toBe(0);
  });

  it(`tries at most ${AUTO_ATTEMPTS_PER_RUN} stories per run, failed ones included`, async () => {
    await createStories(AUTO_ATTEMPTS_PER_RUN + 5);
    const { ingestion, upstreamRequests } = await createIngestion({
      // Every thread answers 404, a failure of the story alone, so the step keeps going.
      fixtures: { missing: ['hn.algolia.com'] },
    });

    await ingestion.run();

    expect(upstreamRequests).toHaveLength(AUTO_ATTEMPTS_PER_RUN);
  });

  it('skips a story whose auto call failed earlier today until the next UTC day', async () => {
    await createStories(3);
    const [s0, s1] = await prisma.story.findMany({ orderBy: { rankScore: 'desc' }, take: 2 });
    const failedCall = (refId: string, day: Date) =>
      prisma.llmUsage.create({
        data: {
          day,
          feature: 'summary_auto',
          model: 'claude-haiku-5-5',
          status: 'failed',
          reservedUsd: '0.00075',
          costUsd: '0',
          refId,
        },
      });
    await failedCall(s0!.id, utcDay(new Date()));
    await failedCall(s1!.id, new Date(utcDay(new Date()).getTime() - DAY_MS));
    const { ingestion, model } = await createIngestion();

    await ingestion.run();

    expect(storiesSummarised(model)).toEqual(['s1', 's2']);
  });

  it('makes no fetch and no LLM call once the run budget is spent', async () => {
    await createStories(2);
    const { moduleRef: current, model, upstreamRequests } = await createIngestion();

    await current
      .get(AutoSummariesStep)
      .run({ runId: 'spent', startedAt: new Date(), now: new Date(), signal: AbortSignal.abort() });

    expect(upstreamRequests).toHaveLength(0);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('runs only with both FEATURE_SUMMARIES and AUTO_SUMMARIES on, so e2e never calls the live model', async () => {
    await createStories(2);
    // CI's e2e API: summaries on with a placeholder key, AUTO_SUMMARIES unset.
    for (const env of [SUMMARIES_ON, { AUTO_SUMMARIES: 'true' }]) {
      const {
        ingestion,
        model,
        upstreamRequests,
        moduleRef: current,
      } = await createIngestion({ env });

      await ingestion.run();

      expect(model.doGenerateCalls).toHaveLength(0);
      expect(upstreamRequests).toHaveLength(0);
      await current.close();
    }
    moduleRef = undefined;
    expect(await prisma.summary.count()).toBe(0);
  });
});
