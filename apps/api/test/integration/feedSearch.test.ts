import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, FeedPageSchema, type FeedPage } from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LruCache } from '../../src/common/cache/lru.cache.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const HOUR = 3_600_000;

const STORIES = [
  { title: 'Angular 21 is out', excerpt: 'Compared with React' },
  { title: 'Only Angular news' },
  { title: 'JavaScript tooling' },
  { title: 'TypeScript 7 released' },
  { title: 'AI agents at work' },
  { title: 'Maintaining a monorepo' },
  { title: '1000 stars on GitHub' },
  { title: '100% test coverage' },
  { title: 'a-b testing' },
  { title: 'a_b naming' },
  { title: 'Why C++ matters' },
  { title: 'Say "bun runtime" aloud' },
  { title: 'Bun runtime launch' },
  { title: 'Anti -angular rant' },
  { title: 'All about database design' },
  { title: 'Frameworks roundup', excerpt: 'Covers Svelte and more' },
  { title: 'İstanbul travel notes' },
  { title: 'ISTANBUL guide' },
  { title: 'ÉCOLE de code' },
  { title: 'école notes' },
  { title: String.raw`Path C:\dev` },
  { title: 'Angular and React', excerpt: 'Two tools' },
  { title: 'Angular or React', excerpt: 'A choice' },
];

describe('GET /api/v1/feed search', () => {
  const prisma = useTestDatabase();
  let app: INestApplication;

  async function getFeed(params: Record<string, string | number>) {
    return request(app.getHttpServer()).get('/api/v1/feed').query(params);
  }
  async function feedTitles(params: Record<string, string | number>) {
    const response = await getFeed({ limit: 50, ...params });
    expect(response.status).toBe(200);
    return FeedPageSchema.parse(response.body).items.map((item) => item.title);
  }
  async function foundTitles(q: string) {
    return (await feedTitles({ q })).sort();
  }
  /** Every item of a query, read page by page through its cursors. */
  async function pagedTitles(params: Record<string, string | number>) {
    const titles: string[] = [];
    let cursor: string | undefined;
    do {
      const response = await getFeed({ ...params, ...(cursor ? { cursor } : {}) });
      expect(response.status).toBe(200);
      const page: FeedPage = FeedPageSchema.parse(response.body);
      titles.push(...page.items.map((item) => item.title));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return titles;
  }

  beforeAll(async () => {
    const hn = await createSource(prisma, 'hn', 'hn');
    for (const [index, story] of STORIES.entries()) {
      await createStory(prisma, {
        ...story,
        publishedAt: new Date(Date.now() - (index + 1) * HOUR),
        rankScore: (index * 7) % 11,
        itemSourceIds: [hn.id],
      });
    }
    app = await createTestApp();
  });
  afterAll(() => app.close());
  beforeEach(() => app.get(LruCache).clear());

  it('AC-1.3.4 finds "Angular 21 is out" by part of a word, at any position and in any case (q=angu)', async () => {
    for (const q of ['angu', 'gular', 'ngul', 'ANGULAR']) {
      expect(await feedTitles({ q })).toContain('Angular 21 is out');
    }
  });

  it('AC-1.3.4 q=script finds JavaScript and TypeScript titles', async () => {
    expect(await foundTitles('script')).toEqual(['JavaScript tooling', 'TypeScript 7 released']);
  });

  it('AC-1.3.4 answers a one-letter q, and q=ai finds "AI agents" and "Maintaining a monorepo"', async () => {
    const expected = STORIES.filter((story) => /a/i.test(`${story.title} ${story.excerpt ?? ''}`))
      .map((story) => story.title)
      .sort();
    expect(await foundTitles('a')).toEqual(expected);
    expect(await foundTitles('ai')).toEqual(['AI agents at work', 'Maintaining a monorepo']);
  });

  it('AC-1.3.4 needs every piece, each in the title or the excerpt', async () => {
    const expected = ['Angular 21 is out', 'Angular and React', 'Angular or React'];
    expect(await foundTitles('angu react')).toEqual(expected);
    expect(await foundTitles('react angu')).toEqual(expected);
    expect(await foundTitles('angu react news')).toEqual([]);
  });

  it('AC-1.3.4 finds a match in the excerpt alone', async () => {
    expect(await foundTitles('svelte')).toEqual(['Frameworks roundup']);
  });

  it('AC-1.3.4 treats %, _ and backslash as plain characters', async () => {
    expect(await foundTitles('100%')).toEqual(['100% test coverage']);
    expect(await foundTitles('a_b')).toEqual(['a_b naming']);
    expect(await foundTitles('\\')).toEqual([String.raw`Path C:\dev`]);
    expect(await foundTitles('%')).toEqual(['100% test coverage']);
  });

  it('AC-1.3.4 treats quotes, a leading minus and punctuation as characters to find', async () => {
    expect(await foundTitles('"bun runtime"')).toEqual(['Say "bun runtime" aloud']);
    expect(await foundTitles('-angular')).toEqual(['Anti -angular rant']);
    expect(await foundTitles('c++')).toEqual(['Why C++ matters']);
  });

  it('AC-1.3.4 treats "or" as a piece to find, not an operator', async () => {
    expect(await foundTitles('angular or react')).toEqual(['Angular or React']);
    expect(await foundTitles('angular and react')).toEqual(['Angular and React']);
  });

  it('AC-1.3.4 does not match word forms: q=databases misses "database"', async () => {
    expect(await foundTitles('databases')).toEqual([]);
    expect(await foundTitles('database')).toEqual(['All about database design']);
  });

  it('AC-1.3.4 ignores case for A-Z only: non-ASCII letters must match exactly', async () => {
    expect(await foundTitles('école')).toEqual(['école notes']);
    expect(await foundTitles('ÉCOLE')).toEqual(['ÉCOLE de code']);
    expect(await foundTitles('istanbul')).toEqual(['ISTANBUL guide']);
    expect(await foundTitles('İSTANBUL')).toEqual(['İstanbul travel notes']);
  });

  it('AC-1.3.4 returns an empty page with 200 for a q that matches nothing', async () => {
    const response = await getFeed({ q: 'zzzzqq' });
    expect(response.status).toBe(200);
    expect(FeedPageSchema.parse(response.body)).toEqual({ items: [], nextCursor: null });
  });

  it('AC-1.3.4 rejects a blank q, a q of 101 characters and a q with a NUL character with 400 VALIDATION_FAILED', async () => {
    for (const q of ['', '   ', 'x'.repeat(101), 'a\u0000b']) {
      const response = await getFeed({ q });
      expect(response.status).toBe(400);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('AC-1.3.4 pages through a search in Top and in Latest, returning every match once', async () => {
    const expected = (await foundTitles('a')).length;
    for (const sort of ['top', 'latest'] as const) {
      const titles = await pagedTitles({ q: 'a', sort, limit: 4 });
      expect(titles).toHaveLength(expected);
      expect(new Set(titles).size).toBe(expected);
    }
  });
});
