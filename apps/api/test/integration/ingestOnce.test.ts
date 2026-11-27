import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/common/http/httpClient.js';
import { IngestOnceModule, runIngestOnce } from '../../src/cli/ingestOnce.module.js';
import { HnAdapter } from '../../src/modules/ingestion/adapters/hn.adapter.js';
import { RankingService } from '../../src/modules/ranking/ranking.service.js';
import { SOURCE_ADAPTERS } from '../../src/modules/ingestion/sourceAdapter.js';
import { hnFixtureFetch } from '../hnFixtureFetch.js';
import { createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

describe('ingest:once CLI', () => {
  const prisma = useTestDatabase();

  it('AC-1.2.12 runs one full ingestion in a standalone application context', async () => {
    await prisma.source.create({
      data: {
        slug: 'hn',
        kind: 'hn',
        name: 'Hacker News',
        siteUrl: 'https://news.ycombinator.com',
      },
    });
    const app = await Test.createTestingModule({ imports: [IngestOnceModule] })
      .overrideProvider(SOURCE_ADAPTERS)
      .useValue([new HnAdapter(new HttpClient(hnFixtureFetch(), () => 0))])
      .compile();

    await app.init();
    const recompute = vi.spyOn(app.get(RankingService), 'recompute');

    const status = await runIngestOnce(app);
    await app.close();

    expect(status).toBe('success');
    expect(await prisma.sourceItem.count()).toBe(95);
    expect(recompute).toHaveBeenCalledOnce();
  });
  it('AC-3.3.2 rolls up TagDailyStat after a CLI run, as the API does', async () => {
    const source = await prisma.source.upsert({
      where: { slug: 'hn' },
      update: {},
      create: {
        slug: 'hn',
        kind: 'hn',
        name: 'Hacker News',
        siteUrl: 'https://news.ycombinator.com',
      },
    });
    await createStory(prisma, {
      title: 'Tagged today',
      publishedAt: new Date(Date.now() - 1000),
      tags: ['rust'],
      itemSourceIds: [source.id],
    });
    const app = await Test.createTestingModule({ imports: [IngestOnceModule] })
      .overrideProvider(SOURCE_ADAPTERS)
      .useValue([new HnAdapter(new HttpClient(hnFixtureFetch(), () => 0))])
      .compile();
    await app.init();

    await runIngestOnce(app);
    await app.close();

    const rows = await prisma.tagDailyStat.findMany({ where: { tag: 'rust' } });
    expect(rows.reduce((sum, row) => sum + row.storyCount, 0)).toBeGreaterThanOrEqual(1);
  });
});
