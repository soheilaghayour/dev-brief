import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { itemEngagement, itemPercentile, rankScore, RSS_BASELINE } from '@devbrief/shared';
import { describe, expect, it, vi } from 'vitest';
import { CacheModule } from '../../src/common/cache/cache.module.js';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { EnvModule } from '../../src/common/env/env.module.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { PrismaModule } from '../../src/common/prisma/prisma.module.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { IngestionModule } from '../../src/modules/ingestion/ingestion.module.js';
import { SOURCE_ADAPTERS } from '../../src/modules/ingestion/sourceAdapter.js';
import { MaintenanceModule } from '../../src/modules/maintenance/maintenance.module.js';
import { MaintenanceService } from '../../src/modules/maintenance/maintenance.service.js';
import { RankingModule } from '../../src/modules/ranking/ranking.module.js';
import { RankingService } from '../../src/modules/ranking/ranking.service.js';
import { createCluster, createSource } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const NOW = new Date('2026-03-10T12:00:00Z');
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

describe('rank recompute and daily job', () => {
  const prisma = useTestDatabase();

  async function createApp(cache = new LruCache()) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EnvModule,
        PrismaModule,
        CacheModule,
        IngestionModule,
        RankingModule,
        MaintenanceModule,
      ],
    })
      .overrideProvider(SOURCE_ADAPTERS)
      .useValue([])
      .overrideProvider(LruCache)
      .useValue(cache)
      .compile();
    await moduleRef.init();
    return moduleRef;
  }

  async function addStory(
    slug: string,
    publishedAt: Date,
    items: { sourceId: string; points?: number }[],
    tags: string[] = [],
  ) {
    const url = `https://example.com/${slug}`;
    return prisma.story.create({
      data: {
        canonicalUrl: url,
        url,
        domain: 'example.com',
        title: slug,
        normalizedTitle: slug,
        publishedAt,
        tags,
        taggerVersion: 1,
        items: {
          create: items.map(({ sourceId, points }, index) => ({
            sourceId,
            externalId: `${slug}-${index}`,
            url,
            canonicalUrl: url,
            title: slug,
            publishedAt,
            points,
          })),
        },
      },
    });
  }

  it('AC-1.2.10 stores the core-function scores: small-sample guard, RSS baseline and k = 2 bonus', async () => {
    const hn = await createSource(prisma, 'hn', 'hn');
    const rss = await createSource(prisma, 'rss-a', 'rss', { baselinePercentile: 0.7 });
    const rssDefault = await createSource(prisma, 'rss-b', 'rss');
    const publishedAt = daysAgo(1);
    const single = await addStory('single', publishedAt, [{ sourceId: hn.id, points: 50 }]);
    const both = await addStory('both', publishedAt, [
      { sourceId: hn.id, points: 20 },
      { sourceId: rss.id },
    ]);
    const plain = await addStory('plain', publishedAt, [{ sourceId: rssDefault.id }]);
    const old = await addStory('old', daysAgo(20), [{ sourceId: hn.id, points: 5 }]);
    const app = await createApp();

    await app.get(RankingService).recompute(NOW);

    const expectedSmall = rankScore({
      percentile: itemPercentile({ kind: 'hn', engagement: 50, sameKindEngagements: [50] }),
      publishedAt,
      now: NOW,
      sourceKinds: ['hn'],
    });
    expect((await prisma.story.findUniqueOrThrow({ where: { id: single.id } })).rankScore).toBe(
      expectedSmall,
    );
    const bothRow = await prisma.story.findUniqueOrThrow({ where: { id: both.id } });
    expect(bothRow.engagementPercentile).toBe(0.7);
    expect(bothRow.rankScore).toBe(
      rankScore({ percentile: 0.7, publishedAt, now: NOW, sourceKinds: ['hn', 'rss'] }),
    );
    expect(bothRow.rankedAt).toEqual(NOW);
    expect(
      (await prisma.story.findUniqueOrThrow({ where: { id: plain.id } })).engagementPercentile,
    ).toBe(RSS_BASELINE);
    expect(
      (await prisma.sourceItem.findFirstOrThrow({ where: { storyId: single.id } })).engagement,
    ).toBe(itemEngagement({ kind: 'hn', points: 50 }));
    const oldRow = await prisma.story.findUniqueOrThrow({ where: { id: old.id } });
    expect(oldRow).toMatchObject({ rankScore: 0, rankedAt: null });
    await app.close();
  });

  it('AC-1.2.10 clears the feed cache after the recompute during an ingestion run', async () => {
    const cache = new LruCache();
    const app = await createApp(cache);
    const order: string[] = [];
    vi.spyOn(app.get(RankingService), 'recompute').mockImplementation(async () => {
      // Pushed after an await, so a clear() that does not wait for the recompute would come first.
      await new Promise((resolve) => setTimeout(resolve, 0));
      order.push('recompute');
    });
    vi.spyOn(cache, 'clear').mockImplementation(() => {
      order.push('clear');
    });

    await app.get(IngestionService).run();

    expect(order).toEqual(['recompute', 'clear']);
    await app.close();
  });

  it('AC-1.2.10 clears the feed cache even when the recompute fails', async () => {
    const cache = new LruCache();
    const app = await createApp(cache);
    vi.spyOn(app.get(RankingService), 'recompute').mockRejectedValue(new Error('batch failed'));
    const clear = vi.spyOn(cache, 'clear');

    await app.get(IngestionService).run();

    expect(clear).toHaveBeenCalledOnce();
    await app.close();
  });

  it('AC-1.2.10 skips writes for scores that did not change', async () => {
    const hn = await createSource(prisma, 'skip-hn', 'hn');
    await addStory('skip', daysAgo(1), [{ sourceId: hn.id, points: 5 }]);
    const app = await createApp();
    const ranking = app.get(RankingService);
    await ranking.recompute(NOW);
    const transaction = vi.spyOn(app.get(PrismaService), '$transaction');

    await ranking.recompute(NOW);

    expect(transaction).not.toHaveBeenCalled();
    await app.close();
  });

  it('AC-1.7.3 keeps a saved 91-day-old story and deletes an unsaved one with its items', async () => {
    const source = await createSource(prisma, 'purge-hn', 'hn');
    const saved = await addStory('saved-old', daysAgo(91), [{ sourceId: source.id }]);
    const unsaved = await addStory('unsaved-old', daysAgo(91), [{ sourceId: source.id }]);
    const fresh = await addStory('fresh', daysAgo(89), [{ sourceId: source.id }]);
    await prisma.user.create({ data: { id: 'u1', name: 'U', email: 'u1@example.com' } });
    await prisma.save.create({ data: { userId: 'u1', storyId: saved.id } });
    const app = await createApp();

    await app.get(MaintenanceService).runDaily(NOW);

    const remaining = (await prisma.story.findMany()).map((story) => story.id);
    expect(remaining).toContain(saved.id);
    expect(remaining).toContain(fresh.id);
    expect(remaining).not.toContain(unsaved.id);
    expect(await prisma.sourceItem.count({ where: { storyId: unsaved.id } })).toBe(0);
    expect(await prisma.sourceItem.count({ where: { storyId: saved.id } })).toBe(1);
    await app.close();
  });

  it('AC-2.1.7 ranks every member with k over the cluster, makes the best one the only primary and sets the cluster rank', async () => {
    const hn = await createSource(prisma, 'cl-hn', 'hn');
    const rss = await createSource(prisma, 'cl-rss', 'rss', { baselinePercentile: 0.1 });
    const strong = await addStory('cl-strong', daysAgo(1), [{ sourceId: hn.id, points: 80 }]);
    const weak = await addStory('cl-weak', daysAgo(1), [{ sourceId: rss.id }]);
    const alone = await addStory('cl-alone', daysAgo(1), [{ sourceId: hn.id, points: 80 }]);
    const cluster = await createCluster(prisma, {
      memberIds: [strong.id, weak.id],
      representativeId: weak.id,
      sourceKinds: ['hn', 'rss'],
    });
    const app = await createApp();

    await app.get(RankingService).recompute(NOW);

    const [strongRow, weakRow, aloneRow] = await Promise.all(
      [strong, weak, alone].map((s) => prisma.story.findUniqueOrThrow({ where: { id: s.id } })),
    );
    // The same HN item scores k = 2 in the cluster and k = 1 alone.
    expect(strongRow?.rankScore).toBeCloseTo((aloneRow?.rankScore ?? 0) * 1.15, 9);
    expect(strongRow?.rankScore).toBeGreaterThan(weakRow?.rankScore ?? Infinity);
    expect(strongRow?.isPrimary).toBe(true);
    expect(weakRow?.isPrimary).toBe(false);
    const stored = await prisma.cluster.findUniqueOrThrow({ where: { id: cluster.id } });
    expect(stored.representativeStoryId).toBe(strong.id);
    expect(stored.rankScore).toBe(strongRow?.rankScore);
    await app.close();
  });

  it('AC-2.1.7 swaps the representative on the next recompute when engagement swaps', async () => {
    const hn = await createSource(prisma, 'swap-hn', 'hn');
    const first = await addStory('swap-first', daysAgo(1), [{ sourceId: hn.id, points: 90 }]);
    const second = await addStory('swap-second', daysAgo(1), [{ sourceId: hn.id, points: 10 }]);
    // Ten more HN items, so percentiles come from the sample and not the small-sample 0.5.
    for (let index = 0; index < 10; index += 1) {
      await addStory(`swap-filler-${index}`, daysAgo(1), [{ sourceId: hn.id, points: 20 + index }]);
    }
    const cluster = await createCluster(prisma, {
      memberIds: [first.id, second.id],
      representativeId: second.id,
      sourceKinds: ['hn'],
    });
    const app = await createApp();
    const ranking = app.get(RankingService);
    await ranking.recompute(NOW);
    expect(
      (await prisma.cluster.findUniqueOrThrow({ where: { id: cluster.id } })).representativeStoryId,
    ).toBe(first.id);

    await prisma.sourceItem.updateMany({ where: { storyId: first.id }, data: { points: 1 } });
    await prisma.sourceItem.updateMany({ where: { storyId: second.id }, data: { points: 500 } });
    await ranking.recompute(NOW);

    const stored = await prisma.cluster.findUniqueOrThrow({ where: { id: cluster.id } });
    expect(stored.representativeStoryId).toBe(second.id);
    const primaries = await prisma.story.findMany({
      where: { clusterId: cluster.id, isPrimary: true },
    });
    expect(primaries.map((story) => story.id)).toEqual([second.id]);
    await app.close();
  });

  it('AC-2.1.7 re-picks the representative of a 3-member cluster when the purge removes it', async () => {
    const hn = await createSource(prisma, 'purge-rep-hn', 'hn');
    const devto = await createSource(prisma, 'purge-rep-devto', 'devto');
    const rep = await addStory('pr-rep', daysAgo(91), [{ sourceId: hn.id }]);
    const kept = await addStory('pr-kept', daysAgo(10), [{ sourceId: hn.id }]);
    const other = await addStory('pr-other', daysAgo(10), [{ sourceId: devto.id }]);
    await prisma.story.update({ where: { id: kept.id }, data: { rankScore: 5 } });
    await prisma.story.update({ where: { id: other.id }, data: { rankScore: 2 } });
    const cluster = await createCluster(prisma, {
      memberIds: [rep.id, kept.id, other.id],
      representativeId: rep.id,
      sourceKinds: ['hn', 'devto'],
    });
    const app = await createApp();

    await app.get(MaintenanceService).runDaily(NOW);

    const stored = await prisma.cluster.findUniqueOrThrow({ where: { id: cluster.id } });
    expect(stored).toMatchObject({
      representativeStoryId: kept.id,
      memberCount: 2,
      rankScore: 5,
    });
    expect(stored.sourceKinds.sort()).toEqual(['devto', 'hn']);
    const members = await prisma.story.findMany({ where: { clusterId: cluster.id } });
    expect(members.filter((story) => story.isPrimary).map((story) => story.id)).toEqual([kept.id]);
    await app.close();
  });

  it('AC-2.1.7 dissolves a cluster the purge leaves with one member, resetting that story to a single primary story', async () => {
    const hn = await createSource(prisma, 'dissolve-hn', 'hn');
    const gone = await addStory('ds-gone', daysAgo(91), [{ sourceId: hn.id }]);
    const left = await addStory('ds-left', daysAgo(10), [{ sourceId: hn.id }]);
    const cluster = await createCluster(prisma, {
      memberIds: [gone.id, left.id],
      representativeId: gone.id,
      sourceKinds: ['hn'],
    });
    await prisma.story.update({ where: { id: left.id }, data: { clusterScore: 0.9 } });
    const app = await createApp();

    await app.get(MaintenanceService).runDaily(NOW);

    expect(await prisma.cluster.findUnique({ where: { id: cluster.id } })).toBeNull();
    expect(await prisma.story.findUniqueOrThrow({ where: { id: left.id } })).toMatchObject({
      clusterId: null,
      isPrimary: true,
      clusterScore: null,
    });
    await app.close();
  });

  it('AC-2.1.7 keeps a saved member of a cluster past retention and recounts the cluster around it', async () => {
    const hn = await createSource(prisma, 'keep-hn', 'hn');
    const saved = await addStory('ks-saved', daysAgo(91), [{ sourceId: hn.id }]);
    const gone = await addStory('ks-gone', daysAgo(91), [{ sourceId: hn.id }]);
    const fresh = await addStory('ks-fresh', daysAgo(10), [{ sourceId: hn.id }]);
    const cluster = await createCluster(prisma, {
      memberIds: [saved.id, gone.id, fresh.id],
      representativeId: gone.id,
      sourceKinds: ['hn'],
    });
    await prisma.user.create({ data: { id: 'u-keep', name: 'K', email: 'keep@example.com' } });
    await prisma.save.create({ data: { userId: 'u-keep', storyId: saved.id } });
    const app = await createApp();

    await app.get(MaintenanceService).runDaily(NOW);

    expect(await prisma.story.findUnique({ where: { id: saved.id } })).not.toBeNull();
    expect(await prisma.story.findUnique({ where: { id: gone.id } })).toBeNull();
    const stored = await prisma.cluster.findUniqueOrThrow({ where: { id: cluster.id } });
    expect(stored.memberCount).toBe(2);
    expect([saved.id, fresh.id]).toContain(stored.representativeStoryId);
    await app.close();
  });

  it('purges the Summary of a 91-day-old unsaved story with the story', async () => {
    const source = await createSource(prisma, 'summary-purge-hn', 'hn');
    const story = await addStory('summarised-old', daysAgo(91), [{ sourceId: source.id }]);
    await prisma.summary.create({
      data: {
        storyId: story.id,
        tldr: ['one', 'two', 'three'],
        basedOnComments: 0,
        trigger: 'auto',
        model: 'claude-haiku-5-5',
        promptVersion: 1,
        inputTokens: 1000,
        outputTokens: 200,
        costUsd: '0.000200',
      },
    });
    const app = await createApp();

    await app.get(MaintenanceService).runDaily(NOW);

    expect(await prisma.story.count({ where: { id: story.id } })).toBe(0);
    expect(await prisma.summary.count({ where: { storyId: story.id } })).toBe(0);
    await app.close();
  });

  it('deletes LlmUsage older than 400 days and RateLimitCounters older than 7 days', async () => {
    const usage = { feature: 'copilot', model: 'claude-haiku-5-5', status: 'settled' } as const;
    await prisma.llmUsage.createMany({
      data: [
        { ...usage, day: daysAgo(401), reservedUsd: '0.001', refId: 'expired' },
        { ...usage, day: daysAgo(400), reservedUsd: '0.001', refId: 'kept' },
      ],
    });
    await prisma.rateLimitCounter.createMany({
      data: [
        { key: 'expired', day: daysAgo(8), count: 3 },
        { key: 'kept', day: daysAgo(7), count: 3 },
      ],
    });
    const app = await createApp();

    await app.get(MaintenanceService).runDaily(NOW);

    expect((await prisma.llmUsage.findMany()).map((row) => row.refId)).toEqual(['kept']);
    expect((await prisma.rateLimitCounter.findMany()).map((row) => row.key)).toEqual(['kept']);
    await app.close();
  });

  it('AC-1.7.3 recomputes TagDailyStat for the last 3 UTC days idempotently', async () => {
    const source = await createSource(prisma, 'stat-hn', 'hn');
    await addStory(
      'stat-1',
      new Date('2026-03-09T23:30:00Z'),
      [{ sourceId: source.id, points: 30 }],
      ['rust'],
    );
    await addStory(
      'stat-2',
      new Date('2026-03-09T02:00:00Z'),
      [{ sourceId: source.id, points: 10 }],
      ['rust', 'go'],
    );
    await addStory('stat-3', new Date('2026-03-05T02:00:00Z'), [{ sourceId: source.id }], ['rust']);
    const app = await createApp();
    await app.get(RankingService).recompute(NOW);
    const maintenance = app.get(MaintenanceService);

    await maintenance.runDaily(NOW);
    const first = await prisma.tagDailyStat.findMany({ orderBy: [{ day: 'asc' }, { tag: 'asc' }] });
    await maintenance.runDaily(NOW);
    const second = await prisma.tagDailyStat.findMany({
      orderBy: [{ day: 'asc' }, { tag: 'asc' }],
    });

    const strip = (rows: typeof first) => rows.map((row) => ({ ...row, updatedAt: undefined }));
    expect(strip(second)).toEqual(strip(first));
    expect(first).toHaveLength(2);
    expect(first.find((row) => row.tag === 'rust')).toMatchObject({
      day: new Date('2026-03-09T00:00:00Z'),
      storyCount: 2,
      engagementSum: 40,
    });
    await app.close();
  });

  it('AC-1.7.3 drops a tag-day row whose only story lost the tag', async () => {
    await prisma.save.deleteMany();
    await prisma.story.deleteMany();
    await prisma.tagDailyStat.deleteMany();
    const source = await createSource(prisma, 'ghost-hn', 'hn');
    const story = await addStory(
      'ghost',
      new Date('2026-03-09T02:00:00Z'),
      [{ sourceId: source.id }],
      ['go'],
    );
    const app = await createApp();
    const maintenance = app.get(MaintenanceService);
    await maintenance.runDaily(NOW);

    await prisma.story.update({ where: { id: story.id }, data: { tags: ['rust'] } });
    await maintenance.runDaily(NOW);

    const rows = await prisma.tagDailyStat.findMany();
    expect(rows.map(({ tag, storyCount }) => ({ tag, storyCount }))).toEqual([
      { tag: 'rust', storyCount: 1 },
    ]);
    await app.close();
  });

  it('AC-1.7.3 buckets days in UTC when the process runs in another time zone', async () => {
    const previousZone = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      await prisma.save.deleteMany();
      await prisma.story.deleteMany();
      await prisma.tagDailyStat.deleteMany();
      const source = await createSource(prisma, 'tz-hn', 'hn');
      await addStory('tz', new Date('2026-03-09T23:30:00Z'), [{ sourceId: source.id }], ['rust']);
      const app = await createApp();

      await app.get(MaintenanceService).runDaily(NOW);

      const rows = await prisma.tagDailyStat.findMany();
      expect(rows.map((row) => row.day)).toEqual([new Date('2026-03-09T00:00:00Z')]);
      await app.close();
    } finally {
      if (previousZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousZone;
    }
  });

  it('AC-1.7.3 keeps running the later steps when one step fails', async () => {
    await prisma.user.create({ data: { id: 'u3', name: 'U3', email: 'u3@example.com' } });
    await prisma.session.create({
      data: { id: 's-expired', token: 't3', userId: 'u3', expiresAt: daysAgo(1) },
    });
    const app = await createApp();
    const maintenance = app.get(MaintenanceService);
    vi.spyOn(app.get(PrismaService).story, 'findMany').mockRejectedValue(new Error('db hiccup'));

    await maintenance.runDaily(NOW);

    expect(await prisma.session.count({ where: { id: 's-expired' } })).toBe(0);
    await app.close();
  });

  it('AC-1.7.3 deletes IngestionRuns older than 30 days and expired sessions and verifications', async () => {
    await prisma.ingestionRun.createMany({
      data: [
        { runId: 'old', status: 'success', startedAt: daysAgo(31) },
        { runId: 'recent', status: 'success', startedAt: daysAgo(29) },
      ],
    });
    await prisma.user.create({ data: { id: 'u2', name: 'U2', email: 'u2@example.com' } });
    await prisma.session.createMany({
      data: [
        { id: 's-old', token: 't1', userId: 'u2', expiresAt: daysAgo(1) },
        { id: 's-live', token: 't2', userId: 'u2', expiresAt: new Date(NOW.getTime() + DAY_MS) },
      ],
    });
    await prisma.verification.createMany({
      data: [
        { id: 'v-old', identifier: 'a', value: 'x', expiresAt: daysAgo(1) },
        { id: 'v-live', identifier: 'b', value: 'y', expiresAt: new Date(NOW.getTime() + DAY_MS) },
      ],
    });
    const app = await createApp();

    await app.get(MaintenanceService).runDaily(NOW);

    expect(
      (await prisma.ingestionRun.findMany({ where: { runId: { in: ['old', 'recent'] } } })).map(
        (run) => run.runId,
      ),
    ).toEqual(['recent']);
    expect((await prisma.session.findMany()).map((session) => session.id)).toEqual(['s-live']);
    expect((await prisma.verification.findMany()).map((row) => row.id)).toEqual(['v-live']);
    await app.close();
  });

  it('AC-1.7.3 schedules the daily job at 15 3 * * * in UTC', () => {
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      MaintenanceService.prototype.runScheduled,
    ) as { cronTime: string; timeZone: string };
    expect(options).toMatchObject({ cronTime: '15 3 * * *', timeZone: 'UTC' });
  });
});
