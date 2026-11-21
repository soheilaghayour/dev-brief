import { readFileSync } from 'node:fs';
import type { TestingModule } from '@nestjs/testing';
import { CLUSTER_MAX_SIZE, normalizeTitle } from '@devbrief/shared';
import { APICallError } from 'ai';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClusterMembershipService } from '../../src/modules/clustering/clusterMembership.service.js';
import { CLUSTER_MAX_CALLS_PER_RUN } from '../../src/modules/clustering/clusteringRules.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { LLM_CAP_CLUSTER_USD_DAY, utcDay } from '../../src/modules/llm/budget.js';
import { LlmService } from '../../src/modules/llm/llm.service.js';
import { modelReply } from '../mockLanguageModel.js';
import {
  CLUSTERING_ON,
  createClusteringModule,
  runContext,
  seedStory,
} from './clusteringTestModule.js';
import { promptOf } from './summariesTestModule.js';
import { createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const MATCH_C1 = { match: 'c1', confidence: 0.93 };

describe('clustering step', () => {
  const prisma = useTestDatabase();
  const sourceIds = { hn: '', devto: '', rss: '' };
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    sourceIds.hn = (await createSource(prisma, 'hn', 'hn')).id;
    sourceIds.devto = (await createSource(prisma, 'devto', 'devto')).id;
    sourceIds.rss = (await createSource(prisma, 'blog', 'rss')).id;
  });

  beforeEach(async () => {
    await prisma.llmUsage.deleteMany();
    await prisma.story.deleteMany();
    await prisma.cluster.deleteMany();
  });

  afterEach(() => moduleRef?.close());

  async function create(options: Partial<Parameters<typeof createClusteringModule>[0]> = {}) {
    const created = await createClusteringModule({
      doGenerate: async () => modelReply(MATCH_C1),
      ...options,
    });
    moduleRef = created.moduleRef;
    return created;
  }

  const old = (title: string, extra: Partial<Parameters<typeof seedStory>[1]> = {}) =>
    seedStory(prisma, { title, sourceId: sourceIds.hn, fresh: false, ...extra });
  const fresh = (title: string, extra: Partial<Parameters<typeof seedStory>[1]> = {}) =>
    seedStory(prisma, { title, sourceId: sourceIds.devto, ...extra });

  const story = (id: string) => prisma.story.findUniqueOrThrow({ where: { id } });

  it('AC-2.1.2 makes no call for a story without candidates and leaves its clusterScore null', async () => {
    await old('Rust 1.90 released');
    const lonely = await fresh('Gardening tips for spring tomatoes');
    const { step, model } = await create();

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(0);
    expect((await story(lonely.id)).clusterScore).toBeNull();
    expect(await prisma.llmUsage.count()).toBe(0);
  });

  it('pairs a new story with a single story: one Cluster with both, the union of source kinds, the existing story as representative', async () => {
    const existing = await old('Bun 1.2 released with a built-in Postgres client', {
      rankScore: 7,
    });
    const joiner = await fresh('Bun 1.2 is out: built-in Postgres client');
    const { step, model } = await create();

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(1);
    const clusters = await prisma.cluster.findMany();
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({
      representativeStoryId: existing.id,
      memberCount: 2,
      rankScore: 7,
    });
    expect([...(clusters[0]?.sourceKinds ?? [])].sort()).toEqual(['devto', 'hn']);
    expect(await story(joiner.id)).toMatchObject({
      clusterId: clusters[0]?.id,
      isPrimary: false,
      clusterScore: 0.93,
    });
    expect(await story(existing.id)).toMatchObject({
      clusterId: clusters[0]?.id,
      isPrimary: true,
      clusterScore: null,
    });
  });

  it('AC-2.1.3 stores the LlmUsage row with feature cluster and the story as refId', async () => {
    await old('Bun 1.2 released with a built-in Postgres client');
    const joiner = await fresh('Bun 1.2 is out: built-in Postgres client');
    const { step } = await create();

    await step.run(runContext());

    const usage = await prisma.llmUsage.findMany();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ feature: 'cluster', refId: joiner.id, status: 'settled' });
  });

  it('AC-2.1.3 stores the confidence of a match below the minimum without joining, and 0 for none', async () => {
    await old('Bun 1.2 released with a built-in Postgres client');
    const doubtful = await fresh('Bun 1.2 is out: built-in Postgres client', {
      publishedAt: new Date(Date.now() + 1_000),
    });
    const unrelated = await fresh('Bun 1.2 benchmarks: built-in Postgres client', {
      publishedAt: new Date(Date.now() + 2_000),
    });
    const replies = [
      { match: 'c1', confidence: 0.6 },
      { match: 'none', confidence: 0.9 },
    ];
    const { step } = await create({
      doGenerate: async () => modelReply(replies.shift()),
    });

    await step.run(runContext());

    expect(await prisma.cluster.count()).toBe(0);
    expect((await story(doubtful.id)).clusterScore).toBe(0.6);
    expect((await story(unrelated.id)).clusterScore).toBe(0);
    expect((await story(unrelated.id)).clusterId).toBeNull();
  });

  it('AC-2.1.6 adds only the new story when it matches a member of a multi-member cluster, and merges no two multi-member clusters', async () => {
    const [a1, a2, b1, b2] = [
      await old('Deno 3 released with npm compatibility'),
      await old('Deno 3.0 ships npm compatibility'),
      await old('Deno 3 npm compatibility explained in depth'),
      await old('Deno 3 npm compatibility, a deep dive'),
    ];
    const clusterA = await prisma.cluster.create({
      data: { representativeStoryId: a1.id, memberCount: 2, sourceKinds: ['hn'] },
    });
    const clusterB = await prisma.cluster.create({
      data: { representativeStoryId: b1.id, memberCount: 2, sourceKinds: ['hn'] },
    });
    await prisma.story.updateMany({
      where: { id: { in: [a1.id, a2.id] } },
      data: { clusterId: clusterA.id },
    });
    await prisma.story.updateMany({
      where: { id: { in: [b1.id, b2.id] } },
      data: { clusterId: clusterB.id },
    });
    const joiner = await fresh('Deno 3 released: npm compatibility');
    const { step, model } = await create();

    await step.run(runContext());

    // Each cluster is offered once, so the prompt holds s plus two candidates.
    expect(promptOf(model.doGenerateCalls[0]!).match(/<source id=/g)).toHaveLength(3);
    const members = await prisma.story.groupBy({ by: ['clusterId'], _count: true });
    expect(members.map(({ clusterId, _count }) => [clusterId, _count]).sort()).toEqual(
      [
        [clusterA.id, 3],
        [clusterB.id, 2],
      ].sort(),
    );
    expect((await story(joiner.id)).isPrimary).toBe(false);
    expect(await prisma.cluster.findMany({ select: { memberCount: true } })).toEqual(
      expect.arrayContaining([{ memberCount: 3 }, { memberCount: 2 }]),
    );
    expect(await prisma.cluster.count()).toBe(2);
  });

  it('AC-2.1.6 never offers a cluster of 12 members as a candidate', async () => {
    const members = [];
    for (let index = 0; index < CLUSTER_MAX_SIZE; index++) {
      members.push(await old(`Go 1.30 released, report ${index}`));
    }
    const cluster = await prisma.cluster.create({
      data: {
        representativeStoryId: members[0]!.id,
        memberCount: CLUSTER_MAX_SIZE,
        sourceKinds: ['hn'],
      },
    });
    await prisma.story.updateMany({ data: { clusterId: cluster.id } });
    const joiner = await fresh('Go 1.30 released');
    const { step, model } = await create();

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(0);
    expect((await story(joiner.id)).clusterId).toBeNull();
    expect(
      (await prisma.cluster.findUniqueOrThrow({ where: { id: cluster.id } })).memberCount,
    ).toBe(CLUSTER_MAX_SIZE);
  });

  it('lets a later new story match an earlier one from the same run, and decides each story once', async () => {
    const first = await fresh('Svelte 6 released with runes everywhere', {
      publishedAt: new Date(Date.now() - 2_000),
    });
    const second = await fresh('Svelte 6 is out: runes everywhere', {
      publishedAt: new Date(Date.now() - 1_000),
    });
    const { step, model } = await create();

    await step.run(runContext());

    // The earlier story had no decided candidate, so only the later one is asked.
    expect(model.doGenerateCalls).toHaveLength(1);
    expect((await story(first.id)).clusterScore).toBeNull();
    const [cluster] = await prisma.cluster.findMany();
    expect(cluster).toMatchObject({ representativeStoryId: first.id, memberCount: 2 });
    expect((await story(second.id)).clusterId).toBe(cluster?.id);
  });

  it('AC-2.1.5 a provider 500 leaves the story single, writes no Cluster and makes no call for the next story', async () => {
    await old('Zig 0.15 released with a new allocator');
    await fresh('Zig 0.15 is out: a new allocator', { publishedAt: new Date(Date.now() - 2_000) });
    const next = await fresh('Zig 0.15 allocator rewrite lands', {
      publishedAt: new Date(Date.now() - 1_000),
    });
    const { step, model } = await create({
      doGenerate: async () => {
        throw new APICallError({
          message: 'overloaded',
          url: 'https://api.anthropic.com/v1/messages',
          requestBodyValues: {},
          statusCode: 500,
        });
      },
    });

    await step.run(runContext());

    // The first story's call and its one retry; the second story is never asked.
    expect(model.doGenerateCalls).toHaveLength(2);
    expect(await prisma.cluster.count()).toBe(0);
    expect((await story(next.id)).clusterScore).toBeNull();
  }, 15_000);

  it('AC-2.1.5 a provider 429 ends the step the same way', async () => {
    await old('Zig 0.15 released with a new allocator');
    await fresh('Zig 0.15 is out: a new allocator', { publishedAt: new Date(Date.now() - 2_000) });
    await fresh('Zig 0.15 allocator rewrite lands', { publishedAt: new Date(Date.now() - 1_000) });
    const { step, model } = await create({
      doGenerate: async () => {
        throw new APICallError({
          message: 'rate limited',
          url: 'https://api.anthropic.com/v1/messages',
          requestBodyValues: {},
          statusCode: 429,
        });
      },
    });

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(2);
    expect(await prisma.cluster.count()).toBe(0);
  }, 15_000);

  it('AC-2.1.5 twice-invalid output leaves the story single and the next story is still decided', async () => {
    await old('Zig 0.15 released with a new allocator');
    const broken = await fresh('Zig 0.15 is out: a new allocator', {
      publishedAt: new Date(Date.now() - 2_000),
    });
    const next = await fresh('Zig 0.15 allocator rewrite lands', {
      publishedAt: new Date(Date.now() - 1_000),
    });
    const replies = [{ match: 'c9', confidence: 0.9 }, { match: 'c9', confidence: 0.9 }, MATCH_C1];
    const { step, model } = await create({ doGenerate: async () => modelReply(replies.shift()) });

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(3);
    expect((await story(broken.id)).clusterScore).toBeNull();
    expect((await story(next.id)).clusterId).not.toBeNull();
  });

  it('AC-2.1.5 a refused reply leaves the story single and the next story is still decided', async () => {
    await old('Zig 0.15 released with a new allocator');
    const refused = await fresh('Zig 0.15 is out: a new allocator', {
      publishedAt: new Date(Date.now() - 2_000),
    });
    const next = await fresh('Zig 0.15 allocator rewrite lands', {
      publishedAt: new Date(Date.now() - 1_000),
    });
    let calls = 0;
    const { step, model } = await create({
      doGenerate: async () => {
        calls += 1;
        return calls === 1
          ? { ...modelReply({}), finishReason: { unified: 'content-filter', raw: 'refusal' } }
          : modelReply(MATCH_C1);
      },
    });

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(2);
    expect((await story(refused.id)).clusterScore).toBeNull();
    expect((await story(next.id)).clusterId).not.toBeNull();
  });

  it('AC-2.1.5 an exhausted cluster cap makes no call and leaves the story single', async () => {
    await old('Bun 1.2 released with a built-in Postgres client');
    const joiner = await fresh('Bun 1.2 is out: built-in Postgres client');
    await prisma.llmUsage.create({
      data: {
        day: utcDay(new Date()),
        feature: 'cluster',
        model: 'claude-haiku-5-5',
        status: 'settled',
        reservedUsd: LLM_CAP_CLUSTER_USD_DAY,
        costUsd: LLM_CAP_CLUSTER_USD_DAY,
      },
    });
    const { step, model } = await create();

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await story(joiner.id)).toMatchObject({ clusterId: null, clusterScore: null });
    expect(await prisma.cluster.count()).toBe(0);
  });

  it('AC-2.1.5 a second run never decides a story again', async () => {
    await old('Bun 1.2 released with a built-in Postgres client');
    await fresh('Bun 1.2 is out: built-in Postgres client');
    const { step, model } = await create({
      doGenerate: async () => modelReply({ match: 'none', confidence: 0.9 }),
    });
    await step.run(runContext());
    expect(model.doGenerateCalls).toHaveLength(1);

    await step.run({ ...runContext(), startedAt: new Date(Date.now() + 1_000) });

    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it('makes no call and writes nothing when the run budget is spent', async () => {
    await old('Bun 1.2 released with a built-in Postgres client');
    const joiner = await fresh('Bun 1.2 is out: built-in Postgres client');
    const { step, model } = await create();

    await step.run(runContext(AbortSignal.abort()));

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await story(joiner.id)).toMatchObject({ clusterId: null, clusterScore: null });
  });

  it.each([
    ['FEATURE_CLUSTERS off', { ...CLUSTERING_ON, FEATURE_CLUSTERS: 'false' }],
    ['AUTO_CLUSTERING off', { ...CLUSTERING_ON, AUTO_CLUSTERING: 'false' }],
  ])('makes no call and writes nothing with %s', async (_name, env) => {
    await old('Bun 1.2 released with a built-in Postgres client');
    const joiner = await fresh('Bun 1.2 is out: built-in Postgres client');
    const { step, model } = await create({ env });

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(0);
    expect(await story(joiner.id)).toMatchObject({ clusterId: null, clusterScore: null });
    expect(await prisma.cluster.count()).toBe(0);
  });

  it('AC-2.1.2 runs inside the ingestion run, deciding the stories the run created', async () => {
    await old('Bun 1.2 released with a built-in Postgres client');
    // Stamped after the run starts, as a story the run created would be.
    const joiner = await seedStory(prisma, {
      title: 'Bun 1.2 is out: built-in Postgres client',
      sourceId: sourceIds.devto,
    });
    await prisma.story.update({
      where: { id: joiner.id },
      data: { firstSeenAt: new Date(Date.now() + 60_000) },
    });
    const { moduleRef: current, model } = await create();

    await current.get(IngestionService).run();

    expect(model.doGenerateCalls).toHaveLength(1);
    expect((await story(joiner.id)).clusterId).not.toBeNull();
  });

  it("joins an existing cluster through its member and adds the new story's source kind to the cluster", async () => {
    const member = await old('Vite 8 released with Rolldown');
    const second = await old('Vite 8.0 is out: Rolldown by default');
    const cluster = await prisma.cluster.create({
      data: { representativeStoryId: member.id, memberCount: 2, sourceKinds: ['hn'] },
    });
    await prisma.story.updateMany({
      where: { id: { in: [member.id, second.id] } },
      data: { clusterId: cluster.id },
    });
    const joiner = await seedStory(prisma, {
      title: 'Vite 8 is here: Rolldown replaces Rollup',
      sourceId: sourceIds.rss,
    });
    const { step } = await create();

    await step.run(runContext());

    expect((await story(joiner.id)).clusterId).toBe(cluster.id);
    const stored = await prisma.cluster.findUniqueOrThrow({ where: { id: cluster.id } });
    expect(stored.memberCount).toBe(3);
    expect([...stored.sourceKinds].sort()).toEqual(['hn', 'rss']);
  });

  describe('writing a join', () => {
    it("re-reads the partner's cluster inside the transaction, so a partner that has since joined one is not paired anew", async () => {
      const partner = await old('Bun 1.2 released with a built-in Postgres client');
      const other = await old('Bun 1.2 ships a Postgres client');
      const cluster = await prisma.cluster.create({
        data: { representativeStoryId: other.id, memberCount: 2, sourceKinds: ['hn'] },
      });
      await prisma.story.updateMany({
        where: { id: { in: [partner.id, other.id] } },
        data: { clusterId: cluster.id },
      });
      const joiner = await fresh('Bun 1.2 is out: built-in Postgres client');
      const { moduleRef: current } = await create();

      // The candidate list said the partner was single; the database says otherwise.
      const result = await current
        .get(ClusterMembershipService)
        .record(joiner.id, { kind: 'join', clusterScore: 0.9, target: { id: partner.id } });

      expect(result).toEqual({ joined: true, cluster: { id: cluster.id, memberCount: 3 } });
      expect(await prisma.cluster.count()).toBe(1);
      expect((await story(joiner.id)).clusterId).toBe(cluster.id);
    });

    it('AC-2.1.6 leaves the story single, with its score, when the cluster filled up after the candidates were loaded', async () => {
      const members = [];
      for (let index = 0; index < CLUSTER_MAX_SIZE; index++) {
        members.push(await old(`Go 1.30 released, report ${index}`));
      }
      const cluster = await prisma.cluster.create({
        data: {
          representativeStoryId: members[0]!.id,
          memberCount: CLUSTER_MAX_SIZE,
          sourceKinds: ['hn'],
        },
      });
      await prisma.story.updateMany({ data: { clusterId: cluster.id } });
      const joiner = await fresh('Go 1.30 released');
      const { moduleRef: current } = await create();

      const result = await current
        .get(ClusterMembershipService)
        .record(joiner.id, { kind: 'join', clusterScore: 0.9, target: { id: members[0]!.id } });

      expect(result).toEqual({ joined: false, cluster: { id: cluster.id, memberCount: 12 } });
      expect(await story(joiner.id)).toMatchObject({ clusterId: null, clusterScore: 0.9 });
      expect(
        (await prisma.cluster.findUniqueOrThrow({ where: { id: cluster.id } })).memberCount,
      ).toBe(CLUSTER_MAX_SIZE);
    });
  });

  it("AC-2.1.2 hands the run's abort signal to the model call", async () => {
    await old('Bun 1.2 released with a built-in Postgres client');
    await fresh('Bun 1.2 is out: built-in Postgres client');
    const { step, model } = await create();
    const controller = new AbortController();

    await step.run(runContext(controller.signal));
    controller.abort();

    expect(model.doGenerateCalls[0]?.abortSignal?.aborted).toBe(true);
  });

  it('AC-2.1.2 stops after the maximum model calls of one run, leaving the rest single', async () => {
    const now = Date.now();
    for (let index = 0; index < CLUSTER_MAX_CALLS_PER_RUN + 3; index++) {
      const topic = `Topic${index}`;
      await old(`${topic} 1.${index} released`, { publishedAt: new Date(now - 60_000) });
      await fresh(`${topic} 1.${index} is out`, { publishedAt: new Date(now - 30_000 + index) });
    }
    const { step, model } = await create({
      doGenerate: async () => modelReply({ match: 'none', confidence: 0.9 }),
      env: { ...CLUSTERING_ON, LLM_CAP_CLUSTER_USD_DAY: '1', LLM_CAP_GLOBAL_USD_DAY: '1' },
    });

    await step.run(runContext());

    expect(model.doGenerateCalls).toHaveLength(CLUSTER_MAX_CALLS_PER_RUN);
  }, 60_000);

  describe('an unexpected error on one story', () => {
    const failFirst = (current: TestingModule, times: number) => {
      const membership = current.get(ClusterMembershipService);
      const record = membership.record.bind(membership);
      let failures = 0;
      vi.spyOn(membership, 'record').mockImplementation((...args) => {
        failures += 1;
        if (failures <= times) throw new Error('connection lost');
        return record(...args);
      });
    };

    it('leaves that story single, logs it and goes on with the next', async () => {
      await old('Zig 0.15 released with a new allocator');
      const failing = await fresh('Zig 0.15 is out: a new allocator', {
        publishedAt: new Date(Date.now() - 2_000),
      });
      const next = await fresh('Zig 0.15 allocator rewrite lands', {
        publishedAt: new Date(Date.now() - 1_000),
      });
      const { step, moduleRef: current } = await create();
      failFirst(current, 1);

      await step.run(runContext());

      expect((await story(failing.id)).clusterScore).toBeNull();
      expect((await story(next.id)).clusterId).not.toBeNull();
    });

    it('ends the step after three in a row', async () => {
      await old('Zig 0.15 released with a new allocator');
      for (let index = 0; index < 5; index++) {
        await fresh(`Zig 0.15 allocator rewrite ${index}`, {
          publishedAt: new Date(Date.now() - 5_000 + index),
        });
      }
      const { step, model, moduleRef: current } = await create();
      failFirst(current, 100);

      await step.run(runContext());

      expect(model.doGenerateCalls).toHaveLength(3);
    });
  });

  it('AC-2.1.2 adds at most 5 s to a run of 400 new items against a ±72 h window of 1,200 stories', async () => {
    const now = Date.now();
    const HOUR_MS = 3_600_000;
    const titles = realisticTitles(1_600);
    const stories = titles.map((title, index) => {
      const isNew = index >= WINDOW_STORIES;
      const url = `https://news${index % 40}.example.com/${index}-${slugOf(title)}`;
      return {
        canonicalUrl: url,
        url,
        domain: `news${index % 40}.example.com`,
        title,
        normalizedTitle: normalizeTitle(title),
        // Existing stories spread over the 72 h before the run; the new ones over the last day.
        publishedAt: new Date(
          isNew
            ? now - ((index - WINDOW_STORIES) / NEW_STORIES) * 24 * HOUR_MS
            : now - (index / WINDOW_STORIES) * 72 * HOUR_MS,
        ),
        firstSeenAt: isNew ? new Date(now) : new Date(now - 2 * HOUR_MS),
        tags: [],
        taggerVersion: 1,
      };
    });
    await prisma.story.createMany({ data: stories });
    const {
      step,
      model,
      moduleRef: current,
    } = await create({
      doGenerate: async () => modelReply({ match: 'none', confidence: 0.9 }),
      // The calls would pass the daily cap, which a run of this size is not meant to test.
      env: { ...CLUSTERING_ON, LLM_CAP_CLUSTER_USD_DAY: '1', LLM_CAP_GLOBAL_USD_DAY: '1' },
    });

    // The ledger's reserve and settle belong to the model call, so the clock stops while LlmService works.
    const llm = current.get(LlmService);
    const generate = llm.generateStructured.bind(llm);
    let modelCallMs = 0;
    llm.generateStructured = async (request) => {
      const callStarted = performance.now();
      try {
        return await generate(request);
      } finally {
        modelCallMs += performance.now() - callStarted;
      }
    };

    const started = performance.now();
    await step.run({ ...runContext(), startedAt: new Date(now - 60_000) });
    const nonLlmMs = performance.now() - started - modelCallMs;
    process.stderr.write(
      `\nclustering 400 new + 1,200 window stories: ${nonLlmMs.toFixed(0)} ms non-LLM, ${model.doGenerateCalls.length} model calls\n`,
    );

    // Below the per-run maximum, so every new story was scored and none was skipped by the cap.
    expect(model.doGenerateCalls.length).toBeGreaterThan(0);
    expect(model.doGenerateCalls.length).toBeLessThan(CLUSTER_MAX_CALLS_PER_RUN);
    expect(nonLlmMs).toBeLessThan(5_000);
  }, 60_000);
});

const WINDOW_STORIES = 1_200;
const NEW_STORIES = 400;

const slugOf = (title: string) => title.toLowerCase().replaceAll(/\W+/g, '-');

const SYLLABLES =
  'ba be bi bo bu ka ke ki ko ku la le li lo lu ma me mi mo mu na ne ni no nu ra re ri ro ru sa se si so su ta te ti to tu va ve vi vo vu'.split(
    ' ',
  );
// Share of title words that come from real headlines; the rest are invented names, as a real window is full of one-off names.
const REAL_WORD_SHARE = 0.4;

/** Titles of 5 to 10 words, drawn with a fixed seed: some words from the recorded HN and Dev.to headlines, the rest invented names, so a few new stories find candidates and most do not. */
function realisticTitles(count: number) {
  const recorded = (name: string) =>
    JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
  const hnTitles = Object.values(
    recorded('hn/items.json') as Record<string, { title?: string }>,
  ).flatMap(({ title }) => (title ? [title] : []));
  const devtoTitles = (recorded('devto/top.json') as { title: string }[]).map(({ title }) => title);
  const realWords = [...hnTitles, ...devtoTitles].flatMap(
    (title) => title.match(/[\p{L}\p{N}]{6,}/gu) ?? [],
  );
  let state = 7;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  const pick = <Item>(items: readonly Item[]) => items[Math.floor(random() * items.length)] as Item;
  const inventedName = () => {
    const name = Array.from({ length: 2 + Math.floor(random() * 3) }, () => pick(SYLLABLES)).join(
      '',
    );
    return random() < 0.4 ? name.charAt(0).toUpperCase() + name.slice(1) : name;
  };
  return Array.from({ length: count }, () =>
    Array.from({ length: 5 + Math.floor(random() * 6) }, () =>
      random() < REAL_WORD_SHARE ? pick(realWords) : inventedName(),
    ).join(' '),
  );
}
