import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { createTestApp } from './createTestApp.js';
import { ProbeController } from './probe.controller.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const DAY = new Date('2026-03-10T00:00:00Z');

describe('Phase 2 schema', () => {
  const prisma = useTestDatabase();

  async function addStory(title: string) {
    const source = await createSource(prisma, `${title}-hn`, 'hn');
    return createStory(prisma, { title, publishedAt: DAY, itemSourceIds: [source.id] });
  }

  function summaryFor(storyId: string) {
    return {
      storyId,
      tldr: ['one', 'two', 'three'],
      consensus: { pros: ['fast'], cons: [], verdict: 'positive', basedOnComments: 12 },
      suggestedTags: ['rust'],
      basedOnComments: 12,
      trigger: 'on_demand',
      model: 'claude-haiku-5-5',
      promptVersion: 1,
      inputTokens: 1800,
      outputTokens: 240,
      costUsd: '0.000300',
    } satisfies Prisma.SummaryUncheckedCreateInput;
  }

  it('writes and reads a Summary through its story', async () => {
    const story = await addStory('summary-story');
    await prisma.summary.create({ data: summaryFor(story.id) });

    const read = await prisma.story.findUniqueOrThrow({
      where: { id: story.id },
      include: { summary: true },
    });

    expect(read.summary).toMatchObject({ tldr: ['one', 'two', 'three'], trigger: 'on_demand' });
    expect(read.summary?.costUsd.toString()).toBe('0.0003');
  });

  it('refuses a second Summary for the same story on the unique storyId', async () => {
    const story = await addStory('twice-story');
    await prisma.summary.create({ data: summaryFor(story.id) });

    await expect(prisma.summary.create({ data: summaryFor(story.id) })).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('writes and reads a FeedPreference through its user', async () => {
    await prisma.user.create({ data: { id: 'pref-user', name: 'P', email: 'p@example.com' } });
    await prisma.feedPreference.create({
      data: { userId: 'pref-user', kind: 'tag', value: 'rust', mode: 'follow' },
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: 'pref-user' },
      include: { preferences: true },
    });

    expect(user.preferences).toMatchObject([{ kind: 'tag', value: 'rust', mode: 'follow' }]);
  });

  it('writes and reads an LlmUsage row and a RateLimitCounter', async () => {
    await prisma.llmUsage.create({
      data: {
        day: DAY,
        feature: 'summary_auto',
        model: 'claude-haiku-5-5',
        status: 'reserved',
        reservedUsd: '0.001000',
      },
    });
    await prisma.rateLimitCounter.create({ data: { key: 'summary:user:u1', day: DAY } });

    const usage = await prisma.llmUsage.findFirstOrThrow({ where: { day: DAY } });
    const counter = await prisma.rateLimitCounter.findUniqueOrThrow({
      where: { key_day: { key: 'summary:user:u1', day: DAY } },
    });

    expect(usage).toMatchObject({ feature: 'summary_auto', status: 'reserved', costUsd: null });
    expect(usage.reservedUsd.toString()).toBe('0.001');
    expect(counter.count).toBe(0);
  });

  describe('@RequiresFeature', () => {
    let off: INestApplication;
    let on: INestApplication;

    beforeAll(async () => {
      off = await createTestApp([ProbeController], { FEATURE_SUMMARIES: 'false' });
      on = await createTestApp([ProbeController], {
        FEATURE_SUMMARIES: 'true',
        ANTHROPIC_API_KEY: 'test-key',
      });
    });
    afterAll(async () => {
      await off.close();
      await on.close();
    });

    it('answers 404 FEATURE_DISABLED while the flag is off and 200 once it is on', async () => {
      const disabled = await request(off.getHttpServer()).get('/api/v1/probe/summaries');
      const enabled = await request(on.getHttpServer()).get('/api/v1/probe/summaries');

      expect(disabled.status).toBe(404);
      expect(ApiErrorSchema.parse(disabled.body).error.code).toBe('FEATURE_DISABLED');
      expect(enabled.status).toBe(200);
    });

    it('checks the flag before the Origin: a flagged POST without Origin answers 404, not 403', async () => {
      const disabled = await request(off.getHttpServer()).post('/api/v1/probe/summaries');
      const enabled = await request(on.getHttpServer()).post('/api/v1/probe/summaries');

      expect(disabled.status).toBe(404);
      expect(ApiErrorSchema.parse(disabled.body).error.code).toBe('FEATURE_DISABLED');
      // With the flag on, the same request reaches OriginGuard: the 404 above came first.
      expect(ApiErrorSchema.parse(enabled.body).error.code).toBe('FORBIDDEN_ORIGIN');
    });
  });
});
