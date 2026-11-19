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
import { createSource } from './seedStories.js';
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

    await expect(app.get(RankingService).run({ now: NOW })).rejects.toThrow('batch failed');

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
