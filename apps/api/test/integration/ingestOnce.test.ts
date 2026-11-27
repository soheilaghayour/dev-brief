import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/common/http/httpClient.js';
import { IngestOnceModule, runIngestOnce } from '../../src/cli/ingestOnce.module.js';
import { AppModule } from '../../src/app.module.js';
import { POST_RUN_ORDER, IngestionPostRunSteps } from '../../src/modules/ingestion/postRunStep.js';
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

  it('AC-3.3.2 a CLI run rolls up TagDailyStat', async () => {
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
    const publishedAt = new Date(Date.now() - 1000);
    await createStory(prisma, {
      title: 'Tagged today',
      publishedAt,
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

    const row = await prisma.tagDailyStat.findUnique({
      where: { day_tag: { day: new Date(publishedAt.toISOString().slice(0, 10)), tag: 'rust' } },
    });
    expect(row?.storyCount).toBe(1);
  });

  it('AC-1.2.12 registers every post-run step, as the API does', async () => {
    const cli = await Test.createTestingModule({ imports: [IngestOnceModule] }).compile();
    const api = await Test.createTestingModule({
      imports: [AppModule.register({ INGEST_SCHEDULE: false })],
    }).compile();
    await cli.init();
    await api.init();

    const cliSteps = cli.get(IngestionPostRunSteps).list();
    const apiSteps = api.get(IngestionPostRunSteps).list();
    await cli.close();
    await api.close();

    expect(cliSteps.map(({ name }) => name)).toEqual(POST_RUN_ORDER);
    expect(apiSteps.map(({ name }) => name)).toEqual(POST_RUN_ORDER);
  });
});
