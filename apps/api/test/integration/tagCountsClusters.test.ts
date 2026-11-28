import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './createTestApp.js';
import { createCluster, createSource, createStory } from './seedStories.js';
import { expectCountsMatchFeed } from './tagCountsAgree.js';
import { useTestDatabase } from './testDatabase.js';

const HOUR = 3_600_000;

describe('GET /api/v1/tags with clusters on', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;

  beforeAll(async () => {
    const hn = await createSource(prisma, 'hn', 'hn');
    const devto = await createSource(prisma, 'devto', 'devto');
    const story = (title: string, tags: string[], sourceId: string, hours: number) =>
      createStory(prisma, {
        title,
        publishedAt: new Date(Date.now() - hours * HOUR),
        rankScore: 10 - hours,
        tags,
        itemSourceIds: [sourceId],
      });
    const representative = await story('Compiler ships', ['react'], hn.id, 1);
    // The member's tags differ on purpose: a cluster counts once, by its representative's tags.
    const member = await story('Compiler deep dive', ['react', 'rust'], devto.id, 2);
    await story('Plain typescript', ['typescript', 'react'], hn.id, 3);
    await createCluster(prisma, {
      memberIds: [representative.id, member.id],
      representativeId: representative.id,
      sourceKinds: ['hn', 'devto'],
    });
    app = await createTestApp([], { FEATURE_CLUSTERS: 'true', ANTHROPIC_API_KEY: 'test-key' });
  });

  afterAll(() => app.close());

  it('AC-1.3.11 counts a cluster once, by its representative, as the feed lists it', async () => {
    const counts = await expectCountsMatchFeed(app);
    expect(counts['react']).toBe(2);
    expect(counts['rust']).toBe(0);
    await expectCountsMatchFeed(app, { sort: 'latest', kinds: 'devto' });
  });
});
