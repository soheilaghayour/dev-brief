import type { INestApplication } from '@nestjs/common';
import { FeedPageSchema } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { createTestApp } from './createTestApp.js';
import { createCluster, createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const HOUR = 3_600_000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

// Two clusters and a single story. A member's tags, source and text differ from its representative's on purpose:
// every filter must follow the representative, the story the card shows.
describe('feed with clusters', () => {
  const prisma = useTestDatabase();
  let on: INestApplication;
  let off: INestApplication;
  let clusterId = '';

  const getFeed = (app: INestApplication, params: Record<string, string | number> = {}) =>
    request(app.getHttpServer()).get('/api/v1/feed').query(params);

  async function titles(params: Record<string, string | number> = {}) {
    const response = await getFeed(on, params);
    expect(response.status).toBe(200);
    return FeedPageSchema.parse(response.body).items.map((item) => item.title);
  }

  async function pagedTitles(params: Record<string, string | number>) {
    const result: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await getFeed(on, { ...params, ...(cursor ? { cursor } : {}) });
      const page = FeedPageSchema.parse(response.body);
      result.push(...page.items.map((item) => item.title));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return result;
  }

  beforeAll(async () => {
    const hn = await createSource(prisma, 'hn', 'hn');
    const devto = await createSource(prisma, 'devto', 'devto');
    const blog = await createSource(prisma, 'blog', 'rss');
    const story = (title: string, rank: number, tags: string[], sourceId: string, hours = 2) =>
      createStory(prisma, {
        title,
        publishedAt: hoursAgo(hours),
        rankScore: rank,
        tags,
        itemSourceIds: [sourceId],
      });
    const compilerRep = await story('Compiler ships', 10, ['react'], hn.id);
    const compilerMember = await story('Deep dive writeup', 4, ['rust'], devto.id, 3);
    const bunRep = await story('Bun news', 8, ['javascript'], blog.id);
    const bunMember = await story('Bun benchmark notes', 3, ['react'], devto.id, 3);
    await story('Plain typescript', 6, ['typescript'], hn.id);
    clusterId = (
      await createCluster(prisma, {
        memberIds: [compilerRep.id, compilerMember.id],
        representativeId: compilerRep.id,
        sourceKinds: ['hn', 'devto'],
      })
    ).id;
    await createCluster(prisma, {
      memberIds: [bunRep.id, bunMember.id],
      representativeId: bunRep.id,
      sourceKinds: ['rss', 'devto'],
    });
    on = await createTestApp([], { FEATURE_CLUSTERS: 'true', ANTHROPIC_API_KEY: 'test-key' });
    off = await createTestApp([], { FEATURE_CLUSTERS: 'false' });
  });

  afterAll(async () => {
    await on.close();
    await off.close();
  });

  beforeEach(() => {
    on.get(LruCache).clear();
    off.get(LruCache).clear();
  });

  it('AC-2.1.4 lists only primary stories in Top, Latest and search', async () => {
    expect(await titles()).toEqual(['Compiler ships', 'Bun news', 'Plain typescript']);
    expect((await titles({ sort: 'latest' })).sort()).toEqual([
      'Bun news',
      'Compiler ships',
      'Plain typescript',
    ]);
    expect(await titles({ q: 'bun' })).toEqual(['Bun news']);
  });

  it('AC-2.1.4 gives a clustered card cluster { id, memberCount, sources[] } and a single story none', async () => {
    const response = await getFeed(on);
    const page = FeedPageSchema.parse(response.body);
    const [clustered, , single] = page.items;
    expect(clustered?.cluster).toMatchObject({ id: clusterId, memberCount: 2 });
    expect(clustered?.cluster?.sources.map((source) => source.slug).sort()).toEqual([
      'devto',
      'hn',
    ]);
    // The card's own source line stays the representative's.
    expect(clustered?.sources.map((source) => source.slug)).toEqual(['hn']);
    expect(single?.title).toBe('Plain typescript');
    expect(single).not.toHaveProperty('cluster');
  });

  it('AC-2.1.4 lists every story and sends no cluster field with the flag off', async () => {
    const response = await getFeed(off);
    expect(response.status).toBe(200);
    const page = FeedPageSchema.parse(response.body);
    expect(page.items.map((item) => item.title)).toEqual([
      'Compiler ships',
      'Bun news',
      'Plain typescript',
      'Deep dive writeup',
      'Bun benchmark notes',
    ]);
    // Phase 1 byte shape: the word never appears.
    expect(response.text).not.toContain('cluster');
    expect((await getFeed(off, { sort: 'latest' })).text).not.toContain('cluster');
  });

  it('AC-2.2.3 matches a tag filter by the representative only', async () => {
    // Only a member is rust; only a member of the Bun cluster is react.
    expect(await titles({ tags: 'rust' })).toEqual([]);
    expect(await titles({ tags: 'react' })).toEqual(['Compiler ships']);
    expect(await titles({ tags: 'javascript' })).toEqual(['Bun news']);
  });

  it('AC-2.2.3 matches a source filter by the representative only, on the small-source id path', async () => {
    // devto items belong to members alone: no card is a devto card.
    expect(await titles({ sources: 'devto' })).toEqual([]);
    expect(await titles({ sources: 'hn' })).toEqual(['Compiler ships', 'Plain typescript']);
    expect(await titles({ sources: 'blog', sort: 'latest' })).toEqual(['Bun news']);
    expect(await titles({ kinds: 'devto' })).toEqual([]);
  });

  it('AC-2.2.3 matches a search by the representative text only', async () => {
    expect(await titles({ q: 'writeup' })).toEqual([]);
    expect(await titles({ q: 'compiler' })).toEqual(['Compiler ships']);
  });

  it('AC-2.2.3 hides a cluster by its representative: a muted member tag or source changes nothing', async () => {
    expect(await titles({ excludeTags: 'rust' })).toEqual([
      'Compiler ships',
      'Bun news',
      'Plain typescript',
    ]);
    expect(await titles({ excludeTags: 'react' })).toEqual(['Bun news', 'Plain typescript']);
    expect(await titles({ excludeSources: 'devto' })).toEqual([
      'Compiler ships',
      'Bun news',
      'Plain typescript',
    ]);
    expect(await titles({ excludeSources: 'hn' })).toEqual(['Bun news']);
  });

  it('AC-2.2.3 boosts a cluster by its representative and never lists a member, in both Top streams', async () => {
    // typescript boosts the single story: 6 * 1.5 = 9 passes the Bun cluster (8).
    const boosted = ['Compiler ships', 'Plain typescript', 'Bun news'];
    expect(await titles({ boostTags: 'typescript' })).toEqual(boosted);
    // limit 1 forces the two-stream path (a page and one more match); the default limit reads the first rows.
    expect(await pagedTitles({ boostTags: 'typescript', limit: 1 })).toEqual(boosted);
    // rust and devto match members only: nothing is boosted, and members stay out.
    for (const boost of [{ boostTags: 'rust' }, { boostSources: 'devto' }] as Record<
      string,
      string
    >[]) {
      expect(await titles(boost)).toEqual(['Compiler ships', 'Bun news', 'Plain typescript']);
      expect(await pagedTitles({ ...boost, limit: 1 })).toEqual([
        'Compiler ships',
        'Bun news',
        'Plain typescript',
      ]);
    }
    // react boosts the Compiler cluster's representative.
    expect((await titles({ boostTags: 'react' }))[0]).toBe('Compiler ships');
  });
});
