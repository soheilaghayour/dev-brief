import type { INestApplication } from '@nestjs/common';
import {
  ApiErrorSchema,
  ClusterDetailSchema,
  SavedStoryPageSchema,
  StoryDetailSchema,
  StoryLookupResponseSchema,
} from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { createTestApp } from './createTestApp.js';
import { createCluster, createSource, createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

const env = loadEnv();
const MISSING_ID = 'cmissingmissingmissing0000';

describe('cluster reads', () => {
  const prisma = useTestDatabase();
  let on: INestApplication;
  let off: INestApplication;
  let clusterId = '';
  let repId = '';
  let memberId = '';
  let singleId = '';

  beforeAll(async () => {
    const hn = await createSource(prisma, 'hn', 'hn');
    const devto = await createSource(prisma, 'devto', 'devto');
    const base = new Date('2026-05-01T10:00:00Z');
    repId = (
      await createStory(prisma, {
        title: 'Representative',
        publishedAt: base,
        rankScore: 9,
        itemSourceIds: [hn.id],
      })
    ).id;
    memberId = (
      await createStory(prisma, {
        title: 'Member',
        publishedAt: base,
        rankScore: 4,
        itemSourceIds: [devto.id],
      })
    ).id;
    singleId = (
      await createStory(prisma, { title: 'Single', publishedAt: base, itemSourceIds: [hn.id] })
    ).id;
    clusterId = (
      await createCluster(prisma, {
        memberIds: [repId, memberId],
        representativeId: repId,
        sourceKinds: ['hn', 'devto'],
      })
    ).id;
    const flags = { ANTHROPIC_API_KEY: 'test-key', AUTH_TEST_MODE: 'true' };
    on = await createTestApp([], { ...flags, FEATURE_CLUSTERS: 'true' });
    off = await createTestApp([], { ...flags, FEATURE_CLUSTERS: 'false' });
  });

  afterAll(async () => {
    await on.close();
    await off.close();
  });

  it('GET /clusters/:id returns the ClusterDetail with the public cache header', async () => {
    const response = await request(on.getHttpServer()).get(`/api/v1/clusters/${clusterId}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe(
      'public, max-age=60, stale-while-revalidate=300',
    );
    const detail = ClusterDetailSchema.parse(response.body);
    expect(detail.id).toBe(clusterId);
    expect(detail.representative.id).toBe(repId);
    expect(detail.members.map((member) => member.id)).toEqual([memberId]);
    expect(detail.sourceKinds.sort()).toEqual(['devto', 'hn']);
    expect(detail.summary).toBeNull();
  });

  it('GET /clusters/:id answers 404 NOT_FOUND for an unknown id and 400 for a malformed one', async () => {
    const unknown = await request(on.getHttpServer()).get(`/api/v1/clusters/${MISSING_ID}`);
    expect(unknown.status).toBe(404);
    expect(ApiErrorSchema.parse(unknown.body).error.code).toBe('NOT_FOUND');
    expect((await request(on.getHttpServer()).get('/api/v1/clusters/x')).status).toBe(400);
  });

  it('GET /clusters/:id answers 404 FEATURE_DISABLED with the flag off', async () => {
    const response = await request(off.getHttpServer()).get(`/api/v1/clusters/${clusterId}`);
    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('FEATURE_DISABLED');
  });

  it('AC-2.2.2 returns cluster and the other members for a non-representative member', async () => {
    const response = await request(on.getHttpServer()).get(`/api/v1/stories/${memberId}`);
    const detail = StoryDetailSchema.parse(response.body);
    expect(detail.cluster).toMatchObject({ id: clusterId, memberCount: 2 });
    expect(detail.clusterMembers?.map((member) => member.id)).toEqual([repId]);
    // A member story's own summary stays its own.
    expect(detail.id).toBe(memberId);
  });

  it('AC-2.2.2 omits cluster and clusterMembers with the flag off, and for a single story', async () => {
    const flagOff = await request(off.getHttpServer()).get(`/api/v1/stories/${memberId}`);
    expect(flagOff.status).toBe(200);
    expect(flagOff.body).not.toHaveProperty('cluster');
    expect(flagOff.body).not.toHaveProperty('clusterMembers');
    const single = await request(on.getHttpServer()).get(`/api/v1/stories/${singleId}`);
    expect(single.body).not.toHaveProperty('cluster');
    expect(single.body).not.toHaveProperty('clusterMembers');
  });

  it('carries cluster on lookup cards for clustered stories only, flag on', async () => {
    const lookup = (app: INestApplication) =>
      request(app.getHttpServer())
        .post('/api/v1/stories/lookup')
        .set('Origin', env.APP_URL)
        .send({ ids: [memberId, singleId] });
    const cards = StoryLookupResponseSchema.parse((await lookup(on)).body).items;
    expect(cards.find((card) => card.id === memberId)?.cluster?.memberCount).toBe(2);
    expect(cards.find((card) => card.id === singleId)).not.toHaveProperty('cluster');
    expect((await lookup(off)).text).not.toContain('cluster');
  });

  it('carries cluster on the saves list for a saved clustered story', async () => {
    const signIn = await request(on.getHttpServer())
      .post('/api/auth/test/sign-in')
      .set('Origin', env.APP_URL)
      .send({ email: 'cluster-saver@example.com' });
    const cookie = (signIn.get('Set-Cookie') ?? []).map((c) => c.split(';')[0]).join('; ');
    await request(on.getHttpServer())
      .put(`/api/v1/me/saves/${memberId}`)
      .set('Cookie', cookie)
      .set('Origin', env.APP_URL);

    const response = await request(on.getHttpServer())
      .get('/api/v1/me/saves')
      .set('Cookie', cookie);

    const page = SavedStoryPageSchema.parse(response.body);
    expect(page.items[0]?.story.cluster).toMatchObject({ id: clusterId, memberCount: 2 });
  });
});
