import { Test } from '@nestjs/testing';
import { TAXONOMY_VERSION } from '@devbrief/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/common/http/httpClient.js';
import { EnvModule } from '../../src/common/env/env.module.js';
import { PrismaModule } from '../../src/common/prisma/prisma.module.js';
import type { SourceKind } from '../../src/generated/prisma/client.js';
import { HnAdapter } from '../../src/modules/ingestion/adapters/hn.adapter.js';
import { IngestionModule } from '../../src/modules/ingestion/ingestion.module.js';
import { INGEST_LOCK_KEY, IngestionLock } from '../../src/modules/ingestion/ingestion.lock.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { IngestionPostRunSteps } from '../../src/modules/ingestion/postRunStep.js';
import {
  type RawItem,
  type SourceAdapter,
  SOURCE_ADAPTERS,
} from '../../src/modules/ingestion/sourceAdapter.js';
import { hnFixtureFetch } from '../hnFixtureFetch.js';
import { useTestDatabase } from './testDatabase.js';

const HOUR_MS = 3600_000;

function rawItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    externalId: 'a',
    url: 'https://example.com/a',
    discussionUrl: null,
    title: 'A post about databases',
    author: null,
    publishedAt: new Date('2026-02-01T00:00:00Z'),
    points: 10,
    commentsCount: 1,
    reactionsCount: null,
    sourceTags: [],
    excerpt: null,
    readingTimeMinutes: null,
    ...overrides,
  };
}

function stubAdapter(kind: SourceKind, fetch: SourceAdapter['fetch']): SourceAdapter {
  return { kind, fetch };
}

function hnFixtureAdapter() {
  return new HnAdapter(new HttpClient(hnFixtureFetch(), () => 0));
}

describe('ingestion', () => {
  const prisma = useTestDatabase();
  let close: () => Promise<void>;

  async function createService(adapters: SourceAdapter[]) {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, PrismaModule, IngestionModule],
    })
      .overrideProvider(SOURCE_ADAPTERS)
      .useValue(adapters)
      .compile();
    close = () => moduleRef.close();
    return {
      service: moduleRef.get(IngestionService),
      lock: moduleRef.get(IngestionLock),
      postRunSteps: moduleRef.get(IngestionPostRunSteps),
    };
  }

  async function createSources(...kinds: SourceKind[]) {
    for (const kind of kinds) {
      await prisma.source.create({
        data: { slug: kind, kind, name: kind, siteUrl: `https://${kind}.test` },
      });
    }
  }

  beforeEach(() =>
    prisma.$executeRawUnsafe(
      'TRUNCATE "IngestionRun", "SourceItem", "Story", "Source" RESTART IDENTITY CASCADE',
    ),
  );
  afterEach(() => close());

  it('AC-1.2.3 stores exactly 95 HN SourceItems from the recorded front page, each with a Story', async () => {
    await createSources('hn');
    const { service } = await createService([hnFixtureAdapter()]);

    const { status } = await service.run();

    expect(status).toBe('success');
    expect(await prisma.sourceItem.count()).toBe(95);
    expect(await prisma.story.count()).toBe(95);
    const withoutUrl = (await prisma.sourceItem.findMany()).filter(
      (item) => item.url === item.discussionUrl,
    );
    expect(withoutUrl).toHaveLength(3);
  });

  it('AC-1.2.9 tags new stories with tagStory() and the current taxonomy version', async () => {
    await createSources('hn');
    const { service } = await createService([hnFixtureAdapter()]);

    await service.run();

    expect(
      await prisma.story.count({ where: { NOT: { tags: { isEmpty: true } } } }),
    ).toBeGreaterThan(0);
    expect(await prisma.story.count({ where: { taggerVersion: { not: TAXONOMY_VERSION } } })).toBe(
      0,
    );
  });

  it('AC-1.2.9 re-tags stories that an older taxonomy version tagged', async () => {
    const { service } = await createService([]);
    await prisma.story.create({
      data: {
        canonicalUrl: 'https://example.com/rust',
        url: 'https://example.com/rust',
        domain: 'example.com',
        title: 'Rust 2.0 released',
        normalizedTitle: 'rust 2 0 released',
        publishedAt: new Date(),
        tags: [],
        taggerVersion: 0,
      },
    });

    await service.retagStaleStories();

    const story = await prisma.story.findFirstOrThrow();
    expect(story.tags).toContain('rust');
    expect(story.taggerVersion).toBe(TAXONOMY_VERSION);
  });

  it('AC-1.2.5 joins equal normalized titles within 72 h into one Story', async () => {
    await createSources('rss');
    const items = [
      rawItem({
        externalId: '1',
        url: 'https://one.example/a',
        publishedAt: new Date('2026-02-01T00:00:00Z'),
      }),
      rawItem({
        externalId: '2',
        url: 'https://two.example/b',
        publishedAt: new Date(Date.parse('2026-02-01T00:00:00Z') + 71 * HOUR_MS),
      }),
    ];
    const { service } = await createService([stubAdapter('rss', async () => items)]);

    await service.run();

    expect(await prisma.story.count()).toBe(1);
    expect(await prisma.sourceItem.count()).toBe(2);
  });

  it('AC-1.2.5 keeps equal normalized titles more than 72 h apart in two Stories', async () => {
    await createSources('rss');
    const items = [
      rawItem({
        externalId: '1',
        url: 'https://one.example/a',
        publishedAt: new Date('2026-02-01T00:00:00Z'),
      }),
      rawItem({
        externalId: '2',
        url: 'https://two.example/b',
        publishedAt: new Date(Date.parse('2026-02-01T00:00:00Z') + 73 * HOUR_MS),
      }),
    ];
    const { service } = await createService([stubAdapter('rss', async () => items)]);

    await service.run();

    expect(await prisma.story.count()).toBe(2);
  });

  it('AC-1.2.6 creates nothing on a second run and refreshes engagement and lastSeenAt', async () => {
    await createSources('hn');
    let points = 10;
    const adapter = stubAdapter('hn', async () => [rawItem({ points })]);
    const { service } = await createService([adapter]);

    await service.run();
    const before = await prisma.sourceItem.findFirstOrThrow();
    points = 99;
    const second = await service.run();

    expect(await prisma.story.count()).toBe(1);
    expect(await prisma.sourceItem.count()).toBe(1);
    const after = await prisma.sourceItem.findFirstOrThrow();
    expect(after.engagement).toBe(99);
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(before.lastSeenAt.getTime());
    const overall = await prisma.ingestionRun.findFirstOrThrow({
      where: { runId: second.runId, sourceId: null },
    });
    expect(overall).toMatchObject({ itemsCreated: 0, itemsUpdated: 1, itemsFetched: 1 });
    const perSource = await prisma.ingestionRun.findFirstOrThrow({
      where: { runId: second.runId, sourceId: { not: null } },
    });
    expect(perSource.itemsCreated).toBe(0);
  });

  it('AC-1.2.6 creates nothing on a second run over the same recorded front page', async () => {
    await createSources('hn');
    const { service } = await createService([hnFixtureAdapter()]);

    await service.run();
    const second = await service.run();

    expect(await prisma.sourceItem.count()).toBe(95);
    expect(await prisma.story.count()).toBe(95);
    const rows = await prisma.ingestionRun.findMany({ where: { runId: second.runId } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ itemsCreated: 0, itemsUpdated: 95 });
    }
  });

  it('AC-1.2.8 opens the circuit after 3 failures, retries once when half-open, and resets on success', async () => {
    await createSources('devto');
    let calls = 0;
    let healthy = false;
    const devto = stubAdapter('devto', async () => {
      calls++;
      if (!healthy) throw new Error('down');
      return [rawItem()];
    });
    const { service } = await createService([devto]);

    for (let run = 0; run < 3; run++) await service.run();
    const opened = await prisma.source.findUniqueOrThrow({ where: { slug: 'devto' } });
    expect(opened.consecutiveFailures).toBe(3);
    expect(opened.circuitOpenUntil!.getTime()).toBeGreaterThan(Date.now() + 5 * HOUR_MS);

    const skipped = await service.run();
    expect(calls).toBe(3);
    const skippedRow = await prisma.ingestionRun.findFirstOrThrow({
      where: { runId: skipped.runId, sourceId: { not: null } },
    });
    expect(skippedRow.status).toBe('skipped');

    // Half-open: the 6 h have passed, so exactly one attempt is allowed; a failure re-opens the circuit.
    await prisma.source.update({
      where: { slug: 'devto' },
      data: { circuitOpenUntil: new Date(Date.now() - 1000) },
    });
    await service.run();
    expect(calls).toBe(4);
    const reopened = await prisma.source.findUniqueOrThrow({ where: { slug: 'devto' } });
    expect(reopened.consecutiveFailures).toBe(4);
    expect(reopened.circuitOpenUntil!.getTime()).toBeGreaterThan(Date.now());

    healthy = true;
    await prisma.source.update({
      where: { slug: 'devto' },
      data: { circuitOpenUntil: new Date(Date.now() - 1000) },
    });
    await service.run();
    const recovered = await prisma.source.findUniqueOrThrow({ where: { slug: 'devto' } });
    expect(recovered).toMatchObject({ consecutiveFailures: 0, circuitOpenUntil: null });
  });

  it('AC-1.2.2 lets one of two overlapping runs execute and records the other as skipped', async () => {
    await createSources('hn');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let started!: () => void;
    const hasStarted = new Promise<void>((resolve) => (started = resolve));
    const slow = stubAdapter('hn', async () => {
      started();
      await gate;
      return [rawItem()];
    });
    const { service } = await createService([slow]);

    const first = service.run();
    await hasStarted;
    const second = await service.run();
    release();
    const firstResult = await first;

    expect(second.status).toBe('skipped');
    expect(firstResult.status).toBe('success');
    const skippedRow = await prisma.ingestionRun.findFirstOrThrow({
      where: { runId: second.runId },
    });
    expect(skippedRow).toMatchObject({ status: 'skipped', sourceId: null });
    expect(await prisma.sourceItem.count()).toBe(1);
  });

  it('runs registered post-run steps in order after the sources settled, and survives a failing step', async () => {
    await createSources('hn');
    const { service, postRunSteps } = await createService([hnFixtureAdapter()]);
    const calls: string[] = [];
    postRunSteps.register({
      name: 'first',
      run: async () => {
        calls.push(`first sees ${await prisma.sourceItem.count()} items`);
        throw new Error('step failed');
      },
    });
    postRunSteps.register({ name: 'second', run: async () => void calls.push('second') });

    const { status } = await service.run();

    expect(calls).toEqual(['first sees 95 items', 'second']);
    expect(status).toBe('success');
  });

  it('releases and re-acquires the lock after its connection was terminated, without crashing the process', async () => {
    const { lock } = await createService([]);
    const release = await lock.tryAcquire();
    await prisma.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_locks WHERE locktype = 'advisory' AND objid = ${INGEST_LOCK_KEY}`;
    await new Promise((resolve) => setTimeout(resolve, 50));

    await expect(release!()).resolves.toBeUndefined();

    const again = await lock.tryAcquire();
    expect(again).not.toBeNull();
    await again!();
  });
});
