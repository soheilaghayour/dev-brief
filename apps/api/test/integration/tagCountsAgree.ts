import type { INestApplication } from '@nestjs/common';
import { FeedPageSchema, TagListSchema, TAG_SLUGS } from '@devbrief/shared';
import request from 'supertest';
import { expect } from 'vitest';

// The internal token skips the per-IP rate limit, which one test file's hundreds of requests would hit.
export type Params = Record<string, string | number>;

export async function getTagCounts(app: INestApplication, params: Params = {}) {
  const response = await request(app.getHttpServer())
    .get('/api/v1/tags')
    .query(params)
    .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '');
  expect(response.status).toBe(200);
  const list = TagListSchema.parse(response.body);
  return Object.fromEntries(list.tags.map((tag) => [tag.slug, tag.count]));
}

/** Every story id `GET /feed` lists for these params, paged to the end in pages of 7. */
export async function pagedFeedIds(app: INestApplication, params: Params) {
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const response = await request(app.getHttpServer())
      .get('/api/v1/feed')
      .query({ ...params, limit: 7, ...(cursor ? { cursor } : {}) })
      .set('x-internal-token', process.env.INTERNAL_API_TOKEN ?? '');
    expect(response.status).toBe(200);
    const page = FeedPageSchema.parse(response.body);
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return ids;
}

/** For every taxonomy tag, the count equals the stories the feed lists with that tag selected; returns the counts. */
export async function expectCountsMatchFeed(app: INestApplication, params: Params = {}) {
  const counts = await getTagCounts(app, params);
  for (const slug of TAG_SLUGS) {
    const listed = await pagedFeedIds(app, { ...params, tags: slug });
    expect(new Set(listed).size).toBe(listed.length);
    expect(counts[slug], `count of ${slug}`).toBe(listed.length);
  }
  return counts;
}
