import {
  A2uiServerMessageSchema,
  ApiErrorSchema,
  EXAMPLE_QUESTIONS,
  ExampleBriefingListSchema,
} from '@devbrief/shared';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import tsToolingBriefing from '@devbrief/shared/a2ui/fixtures/tsToolingBriefing.json';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ExampleGenerationError,
  generateExampleBriefings,
  GenerateExampleBriefingsModule,
} from '../../src/cli/generateExampleBriefings.module.js';
import { databaseName } from '../../src/cli/confirmDatabase.js';
import { ENV } from '../../src/common/env/env.module.js';
import { loadEnv } from '../../src/env.js';
import { LANGUAGE_MODEL } from '../../src/modules/llm/llm.service.js';
import { mockStreamingModel, replayStream, streamParts } from '../mockLanguageModel.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const HOUR_MS = 3_600_000;
const COPILOT_ON = {
  FEATURE_COPILOT: 'true',
  ANTHROPIC_API_KEY: 'test-key',
  IP_HASH_SECRET: 'test-ip-hash-secret-0123456789abcdef',
};
const PLAN = {
  title: 'This week',
  sections: [
    { kind: 'tags', tags: ['typescript'] },
    { kind: 'tags', tags: ['rust'] },
  ],
};

describe('example briefings', () => {
  const prisma = useTestDatabase();
  let sourceId = '';

  beforeEach(async () => {
    await prisma.llmUsage.deleteMany();
    await prisma.exampleBriefing.deleteMany();
    await prisma.story.deleteMany();
    await prisma.source.deleteMany();
    sourceId = (await createSource(prisma, 'hn', 'hn')).id;
  });

  /** `count` stories matching a question by tag and by title words. */
  async function seedStories(tag: string, title: string, count: number) {
    for (let rank = 1; rank <= count; rank += 1) {
      await createStory(prisma, {
        title: `${title} number ${rank}`,
        publishedAt: new Date(Date.now() - rank * HOUR_MS),
        rankScore: rank,
        tags: [tag],
        itemSourceIds: [sourceId],
      });
    }
  }

  const seedAllCovered = async () => {
    await seedStories('typescript', 'TypeScript tooling debate', 4);
    await seedStories('ai-llms', 'AI tooling launch', 4);
    await seedStories('rust', 'Rust and Go teams choosing', 4);
  };

  describe('briefings:generate', () => {
    let closeModule: (() => Promise<void>) | undefined;
    afterEach(() => closeModule?.());

    async function createCli(envOverrides: Record<string, string | undefined> = {}) {
      const env = loadEnv({ ...process.env, ANTHROPIC_API_KEY: 'test-key', ...envOverrides });
      let calls = 0;
      const model = mockStreamingModel(async (options) => {
        calls += 1;
        return replayStream(streamParts({ ...PLAN, title: `Briefing ${calls}` }), options);
      });
      const moduleRef = await Test.createTestingModule({
        imports: [GenerateExampleBriefingsModule],
      })
        .overrideProvider(ENV)
        .useValue(env)
        .overrideProvider(LANGUAGE_MODEL)
        .useValue(model)
        .compile();
      await moduleRef.init();
      closeModule = () => moduleRef.close();
      return { app: moduleRef, calls: () => calls, confirmed: databaseName(env.DATABASE_URL) };
    }

    const silent = { log: () => {} };

    it('AC-3.2.1 stores three briefings in question order, each message valid, one copilot ledger row per call', async () => {
      await seedAllCovered();
      const { app, confirmed } = await createCli();

      const result = await generateExampleBriefings(app, {
        confirmedDatabase: confirmed,
        ...silent,
      });

      const rows = await prisma.exampleBriefing.findMany({ orderBy: { position: 'asc' } });
      expect(rows.map(({ slug, question, position }) => ({ slug, question, position }))).toEqual(
        EXAMPLE_QUESTIONS.map(({ slug, question }, position) => ({ slug, question, position })),
      );
      for (const row of rows) {
        const messages = row.messages as unknown[];
        expect(messages.length).toBeGreaterThan(2);
        for (const message of messages) A2uiServerMessageSchema.parse(message);
        expect(JSON.stringify(messages)).toContain(`example-${row.slug}`);
      }
      const ledger = await prisma.llmUsage.findMany({ orderBy: { createdAt: 'asc' } });
      expect(ledger.map(({ feature, refId }) => [feature, refId])).toEqual(
        EXAMPLE_QUESTIONS.map(({ slug }) => ['copilot', `example-${slug}`]),
      );
      expect(result.totalCostUsd).toBeGreaterThan(0);
    });

    it('AC-3.2.1 a second run replaces the rows instead of adding to them', async () => {
      await seedAllCovered();
      const { app, confirmed } = await createCli();
      await generateExampleBriefings(app, { confirmedDatabase: confirmed, ...silent });
      const first = await prisma.exampleBriefing.findMany({ orderBy: { position: 'asc' } });

      await generateExampleBriefings(app, { confirmedDatabase: confirmed, ...silent });

      const second = await prisma.exampleBriefing.findMany({ orderBy: { position: 'asc' } });
      expect(second).toHaveLength(3);
      expect(second.map(({ slug }) => slug)).toEqual(first.map(({ slug }) => slug));
      expect(second[0]?.generatedAt.getTime()).toBeGreaterThan(
        first[0]?.generatedAt.getTime() ?? 0,
      );
      expect(JSON.stringify(second[0]?.messages)).toContain('Briefing 4');
    });

    it('AC-3.2.1 when the second question has no coverage it fails, spends nothing and keeps the old rows', async () => {
      await seedAllCovered();
      const { app, confirmed } = await createCli();
      await generateExampleBriefings(app, { confirmedDatabase: confirmed, ...silent });
      const before = await prisma.exampleBriefing.findMany({ orderBy: { position: 'asc' } });
      const ledgerBefore = await prisma.llmUsage.count();
      await prisma.story.deleteMany({ where: { tags: { has: 'ai-llms' } } });
      const lines: string[] = [];

      const run = generateExampleBriefings(app, {
        confirmedDatabase: confirmed,
        log: (line) => lines.push(line),
      });

      await expect(run).rejects.toThrow(ExampleGenerationError);
      await expect(run).rejects.toThrow(/ai-tooling-launches/);
      expect(await prisma.exampleBriefing.findMany({ orderBy: { position: 'asc' } })).toEqual(
        before,
      );
      expect(await prisma.llmUsage.count()).toBe(ledgerBefore);
      // Every question's count is reported, so the owner sees all thin ones at once.
      expect(lines.filter((line) => line.includes('stories retrieved'))).toHaveLength(3);
    });

    it('AC-3.2.1 a generation that fails after the first question keeps the old rows', async () => {
      await seedAllCovered();
      const { app, confirmed } = await createCli();
      await generateExampleBriefings(app, { confirmedDatabase: confirmed, ...silent });
      const before = await prisma.exampleBriefing.findMany({ orderBy: { position: 'asc' } });
      // An empty plan compiles no section, so the pipeline reports an invalid output.
      const emptyModel = mockStreamingModel(async (options) =>
        replayStream(streamParts({ title: 'Empty', sections: [] }), options),
      );
      const failing = await Test.createTestingModule({ imports: [GenerateExampleBriefingsModule] })
        .overrideProvider(ENV)
        .useValue(loadEnv({ ...process.env, ANTHROPIC_API_KEY: 'test-key' }))
        .overrideProvider(LANGUAGE_MODEL)
        .useValue(emptyModel)
        .compile();
      await failing.init();

      await expect(
        generateExampleBriefings(failing, { confirmedDatabase: confirmed, ...silent }),
      ).rejects.toThrow(/failed/);
      await failing.close();

      expect(await prisma.exampleBriefing.findMany({ orderBy: { position: 'asc' } })).toEqual(
        before,
      );
    });

    it('refuses to start without ANTHROPIC_API_KEY, and calls no model', async () => {
      await seedAllCovered();
      const { app, confirmed, calls } = await createCli({ ANTHROPIC_API_KEY: undefined });

      await expect(
        generateExampleBriefings(app, { confirmedDatabase: confirmed, ...silent }),
      ).rejects.toThrow(/ANTHROPIC_API_KEY/);
      expect(calls()).toBe(0);
    });

    it('refuses to run against a database it was not pointed at, and changes nothing', async () => {
      await seedAllCovered();
      const { app, calls } = await createCli();

      await expect(
        generateExampleBriefings(app, { confirmedDatabase: undefined, ...silent }),
      ).rejects.toThrow(/--confirm-database/);
      await expect(
        generateExampleBriefings(app, { confirmedDatabase: 'somewhere_else', ...silent }),
      ).rejects.toThrow(/does not match/);
      expect(calls()).toBe(0);
      expect(await prisma.exampleBriefing.count()).toBe(0);
    });

    it('prints each call cost and the total', async () => {
      await seedAllCovered();
      const { app, confirmed } = await createCli();
      const lines: string[] = [];

      await generateExampleBriefings(app, {
        confirmedDatabase: confirmed,
        log: (line) => lines.push(line),
      });

      for (const { slug } of EXAMPLE_QUESTIONS) {
        expect(lines.some((line) => line.startsWith(`${slug}: $`))).toBe(true);
      }
      expect(lines.at(-1)).toMatch(/^Total: \$\d/);
    });
  });

  describe('GET /copilot/examples', () => {
    let app: INestApplication | undefined;
    afterEach(() => app?.close());

    it('AC-3.2.1 answers the stored briefings in position order with the public cache headers', async () => {
      // Inserted out of order so only `position` can explain the response order.
      for (const position of [2, 0, 1]) {
        const { slug, question } = EXAMPLE_QUESTIONS[position]!;
        await prisma.exampleBriefing.create({
          data: { slug, question, position, messages: tsToolingBriefing },
        });
      }
      app = await createTestApp([], COPILOT_ON);

      const response = await request(app.getHttpServer()).get('/api/v1/copilot/examples');

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe(
        'public, max-age=60, stale-while-revalidate=300',
      );
      const { items } = ExampleBriefingListSchema.parse(response.body);
      expect(items.map(({ slug }) => slug)).toEqual(EXAMPLE_QUESTIONS.map(({ slug }) => slug));
      expect(items[0]?.messages).toHaveLength(tsToolingBriefing.length);
    });

    it('answers { items: [] } with no rows', async () => {
      app = await createTestApp([], COPILOT_ON);

      const response = await request(app.getHttpServer()).get('/api/v1/copilot/examples');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [] });
    });

    it('answers 404 FEATURE_DISABLED with the flag off', async () => {
      app = await createTestApp([], { ...COPILOT_ON, FEATURE_COPILOT: 'false' });

      const response = await request(app.getHttpServer()).get('/api/v1/copilot/examples');

      expect(response.status).toBe(404);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('FEATURE_DISABLED');
    });
  });
});
