import type { TestingModule } from '@nestjs/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { utcDay } from '../../src/modules/llm/budget.js';
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

  /** An ingestion engine with no sources, so a run goes straight to the post-run steps. */
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
        reservedUsd: '0.015',
        costUsd: '0.015',
      },
    });
    const { ingestion, model } = await createIngestion();

    const { status } = await ingestion.run();

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await prisma.summary.count()).toBe(0);
    expect(status).toBe('skipped');
  });

  it('moves on to the next story when one story fails, and leaves the failed one for a later run', async () => {
    await createStories(3);
    const { ingestion, model } = await createIngestion({
      // s0 (rank 3) can't load its thread; s1 (rank 2) gets output that fails validation twice.
      fixtures: { hnFallbackId: '50544168', failing: ['/items/1000'] },
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
