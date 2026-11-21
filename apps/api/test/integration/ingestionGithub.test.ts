import { Test } from '@nestjs/testing';
import { percentile } from '@devbrief/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheModule } from '../../src/common/cache/cache.module.js';
import { EnvModule } from '../../src/common/env/env.module.js';
import { HttpClient } from '../../src/common/http/httpClient.js';
import { PrismaModule } from '../../src/common/prisma/prisma.module.js';
import type { SourceKind } from '../../src/generated/prisma/client.js';
import {
  GITHUB_TOKEN_MISSING,
  GithubAdapter,
} from '../../src/modules/ingestion/adapters/github.adapter.js';
import { HnAdapter } from '../../src/modules/ingestion/adapters/hn.adapter.js';
import { IngestionModule } from '../../src/modules/ingestion/ingestion.module.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { SOURCE_ADAPTERS, type SourceAdapter } from '../../src/modules/ingestion/sourceAdapter.js';
import { RankingModule } from '../../src/modules/ranking/ranking.module.js';
import { RankingService } from '../../src/modules/ranking/ranking.service.js';
import { GITHUB_FIXTURE_NOW, githubFixtureFetch } from '../githubFixtureFetch.js';
import { hnFixtureFetch } from '../hnFixtureFetch.js';
import { useTestDatabase } from './testDatabase.js';

// The two recorded search pages hold 60 distinct repositories.
const GITHUB_ITEMS = 60;
// These tests need HN only as a second kind (ranking among itself, a shared URL), so they take the first 20 top stories (19 valid).
const HN_SAMPLE_STORIES = 20;
const HN_SAMPLE_ITEMS = 19;
// Every item costs several sequential queries; at a load average above 600 the run took 14.5 s with all 155 items.
const SLOW_INGEST_TIMEOUT_MS = 30_000;

function githubAdapter(fetchStub: typeof fetch = githubFixtureFetch(), token = 'test-token') {
  return new GithubAdapter(new HttpClient(fetchStub, () => 0), token, () => GITHUB_FIXTURE_NOW);
}

describe('ingestion of GitHub', { timeout: SLOW_INGEST_TIMEOUT_MS }, () => {
  const prisma = useTestDatabase();
  let close: () => Promise<void>;

  async function createApp(adapters: SourceAdapter[]) {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, PrismaModule, CacheModule, IngestionModule, RankingModule],
    })
      .overrideProvider(SOURCE_ADAPTERS)
      .useValue(adapters)
      .compile();
    await moduleRef.init();
    close = () => moduleRef.close();
    return { service: moduleRef.get(IngestionService), ranking: moduleRef.get(RankingService) };
  }

  async function createSources(...kinds: SourceKind[]) {
    for (const kind of kinds) {
      await prisma.source.create({
        data: { slug: kind, kind, name: kind, siteUrl: `https://${kind}.test` },
      });
    }
  }

  async function sourceRun(runId: string) {
    return prisma.ingestionRun.findFirstOrThrow({
      where: { runId, source: { slug: 'github' } },
    });
  }

  beforeEach(() =>
    prisma.$executeRawUnsafe(
      'TRUNCATE "IngestionRun", "SourceItem", "Story", "Source" RESTART IDENTITY CASCADE',
    ),
  );
  afterEach(() => close());

  it('AC-2.4.1 stores the recorded repos with stars as engagement and ranks them by percentile within the github kind', async () => {
    await createSources('hn', 'github');
    const { service, ranking } = await createApp([
      new HnAdapter(new HttpClient(hnFixtureFetch({ topStories: HN_SAMPLE_STORIES }), () => 0)),
      githubAdapter(),
    ]);

    const { status } = await service.run();
    await ranking.recompute(GITHUB_FIXTURE_NOW);

    expect(status).toBe('success');
    const githubItems = await prisma.sourceItem.findMany({ where: { source: { kind: 'github' } } });
    expect(githubItems).toHaveLength(GITHUB_ITEMS);
    expect(await prisma.sourceItem.count({ where: { source: { kind: 'hn' } } })).toBe(
      HN_SAMPLE_ITEMS,
    );
    const engagements = githubItems.map(({ engagement }) => engagement);
    for (const item of githubItems) {
      expect(item.stars).toBeGreaterThan(50);
      expect(item.engagement).toBe(item.stars);
      // HN points share the window but not the sample: each kind ranks among itself.
      expect(item.percentile).toBe(percentile(item.engagement, engagements));
    }
    const top = githubItems.find(({ externalId }) => externalId === '1459971684');
    expect(top?.percentile).toBe((GITHUB_ITEMS - 1 + 0.5) / GITHUB_ITEMS);
  });

  it('AC-2.4.2 stops after one request when x-ratelimit-remaining is 3: items saved, source run partial, circuit closed', async () => {
    await createSources('github');
    const fetchStub = vi.fn(githubFixtureFetch({ rateLimitRemaining: ['3', '2'] }));
    const { service } = await createApp([githubAdapter(fetchStub)]);

    const { runId, status } = await service.run();

    expect(fetchStub).toHaveBeenCalledOnce();
    expect(status).toBe('partial');
    expect(await prisma.sourceItem.count()).toBe(30);
    expect(await sourceRun(runId)).toMatchObject({
      status: 'partial',
      error: 'GitHub rate limit low (3 requests left); stopped after page 1',
      itemsCreated: 30,
    });
    const source = await prisma.source.findUniqueOrThrow({ where: { slug: 'github' } });
    expect(source).toMatchObject({ consecutiveFailures: 0, circuitOpenUntil: null });
    expect(source.lastSuccessAt).not.toBeNull();
  });

  it('skips the source without GITHUB_TOKEN, makes no request and keeps its circuit closed', async () => {
    await createSources('github');
    const fetchStub = vi.fn(githubFixtureFetch());
    const { service } = await createApp([githubAdapter(fetchStub, '')]);

    for (let run = 0; run < 3; run++) {
      const { runId, status } = await service.run();
      expect(status).toBe('skipped');
      expect(await sourceRun(runId)).toMatchObject({
        status: 'skipped',
        error: GITHUB_TOKEN_MISSING,
      });
    }

    expect(fetchStub).not.toHaveBeenCalled();
    expect(await prisma.source.findUniqueOrThrow({ where: { slug: 'github' } })).toMatchObject({
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      lastErrorAt: null,
    });
  });

  it('joins a repo that is also on HN into the HN Story by canonical URL (exact dedup)', async () => {
    await createSources('hn', 'github');
    const { service } = await createApp([
      new HnAdapter(new HttpClient(hnFixtureFetch({ topStories: HN_SAMPLE_STORIES }), () => 0)),
      githubAdapter(githubFixtureFetch({ pages: ['search-short'] })),
    ]);

    await service.run();

    // search-short has 3 valid repos; one is the onlook repo HN links with a trailing slash.
    expect(await prisma.sourceItem.count()).toBe(HN_SAMPLE_ITEMS + 3);
    expect(await prisma.story.count()).toBe(HN_SAMPLE_ITEMS + 2);
    const story = await prisma.story.findUniqueOrThrow({
      where: { canonicalUrl: 'https://github.com/onlook-dev/onlook' },
      include: { items: { include: { source: true } } },
    });
    expect(story.items.map((item) => item.source.kind).sort()).toEqual(['github', 'hn']);
  });

  it('creates nothing on a second run over the same pages and refreshes stars (idempotent re-ingest)', async () => {
    await createSources('github');
    const { service } = await createApp([githubAdapter()]);

    await service.run();
    await prisma.sourceItem.updateMany({ data: { stars: 1, engagement: 1 } });
    const second = await service.run();

    expect(await prisma.sourceItem.count()).toBe(GITHUB_ITEMS);
    expect(await prisma.story.count()).toBe(GITHUB_ITEMS);
    expect(await sourceRun(second.runId)).toMatchObject({
      itemsCreated: 0,
      itemsUpdated: GITHUB_ITEMS,
    });
    const top = await prisma.sourceItem.findFirstOrThrow({ where: { externalId: '1459971684' } });
    expect(top).toMatchObject({ stars: 5676, engagement: 5676 });
  });

  it('drops an invalid repo without failing the run', async () => {
    await createSources('github');
    const { service } = await createApp([
      githubAdapter(githubFixtureFetch({ pages: ['search-short'] })),
    ]);

    const { runId, status } = await service.run();

    expect(status).toBe('success');
    expect(await sourceRun(runId)).toMatchObject({ status: 'success', itemsFetched: 3 });
    expect(await prisma.sourceItem.count()).toBe(3);
  });
});
