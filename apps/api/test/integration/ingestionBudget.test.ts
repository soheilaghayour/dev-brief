import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EnvModule } from '../../src/common/env/env.module.js';
import { PrismaModule } from '../../src/common/prisma/prisma.module.js';
import { IngestionModule } from '../../src/modules/ingestion/ingestion.module.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { RUN_BUDGET_MESSAGE } from '../../src/modules/ingestion/ingestionRules.js';
import {
  type RawItem,
  type SourceAdapter,
  SOURCE_ADAPTERS,
} from '../../src/modules/ingestion/sourceAdapter.js';
import { useTestDatabase } from './testDatabase.js';

// A 50 ms budget instead of 4 min; its own file because the mock applies to every test in a file.
vi.mock('../../src/modules/ingestion/runBudget.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/modules/ingestion/runBudget.js')>();
  return { ...original, startRunBudget: () => original.startRunBudget(50) };
});

const quickItem: RawItem = {
  externalId: 'a',
  url: 'https://example.com/a',
  discussionUrl: null,
  title: 'A post about databases',
  author: null,
  publishedAt: new Date('2026-02-01T00:00:00Z'),
  points: 10,
  commentsCount: 1,
  reactionsCount: null,
  stars: null,
  sourceTags: [],
  excerpt: null,
  readingTimeMinutes: null,
};

describe('ingestion run budget', () => {
  const prisma = useTestDatabase();
  let close: () => Promise<void>;

  beforeEach(() =>
    prisma.$executeRawUnsafe(
      'TRUNCATE "IngestionRun", "SourceItem", "Story", "Source" RESTART IDENTITY CASCADE',
    ),
  );
  afterEach(() => close());

  it('aborts a source still fetching when the run budget ends, records the abort and releases the lock', async () => {
    for (const kind of ['hn', 'devto'] as const) {
      await prisma.source.create({
        data: { slug: kind, kind, name: kind, siteUrl: `https://${kind}.test` },
      });
    }
    const adapters: SourceAdapter[] = [
      { kind: 'hn', fetch: async () => [quickItem] },
      {
        kind: 'devto',
        fetch: (_source, { signal }) =>
          new Promise((_resolve, reject) => {
            // An abort listener never fires on a signal that is already aborted.
            if (signal.aborted) return reject(signal.reason);
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      },
    ];
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, PrismaModule, IngestionModule],
    })
      .overrideProvider(SOURCE_ADAPTERS)
      .useValue(adapters)
      .compile();
    close = () => moduleRef.close();
    const service = moduleRef.get(IngestionService);

    const { runId, status } = await service.run();

    expect(status).toBe('partial');
    const devtoRun = await prisma.ingestionRun.findFirstOrThrow({
      where: { runId, source: { slug: 'devto' } },
    });
    expect(devtoRun).toMatchObject({ status: 'failed', error: RUN_BUDGET_MESSAGE });
    const devto = await prisma.source.findUniqueOrThrow({ where: { slug: 'devto' } });
    expect(devto.lastError).toBe(RUN_BUDGET_MESSAGE);
    expect((await service.run()).status).not.toBe('skipped');
  });
});
