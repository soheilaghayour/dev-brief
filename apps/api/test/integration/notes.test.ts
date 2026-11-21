import type { INestApplication } from '@nestjs/common';
import {
  ApiErrorSchema,
  NOTE_MAX_LENGTH,
  SaveSchema,
  SavedStoryPageSchema,
} from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { signInUser } from './signedInUser.js';
import { useTestDatabase } from './testDatabase.js';

const APP_URL = loadEnv().APP_URL;
const SAVES = '/api/v1/me/saves';
const UNKNOWN_STORY_ID = 'cunknownstoryxxxxxxxxxx';

describe('save notes', () => {
  let app: INestApplication;
  let flagOff: INestApplication;
  let storyIds: string[];
  const prisma = useTestDatabase();
  const story = (index: number) => storyIds[index] ?? '';
  const signIn = () => signInUser(app, 'noter');

  beforeAll(async () => {
    app = await createTestApp([], { AUTH_TEST_MODE: 'true', FEATURE_COLLECTIONS: 'true' });
    flagOff = await createTestApp([], { AUTH_TEST_MODE: 'true', FEATURE_COLLECTIONS: 'false' });
    const source = await createSource(prisma, 'notes-blog', 'rss');
    const stories = [];
    for (const [index, title] of ['Alpha', 'Bravo'].entries()) {
      stories.push(
        await createStory(prisma, {
          title,
          publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
          itemSourceIds: [source.id],
        }),
      );
    }
    storyIds = stories.map((created) => created.id);
  });
  afterAll(async () => {
    await app.close();
    await flagOff.close();
  });

  it('GET and PATCH /me/saves/:storyId answer 401 UNAUTHENTICATED without a session', async () => {
    const http = () => request(app.getHttpServer());
    const responses = [
      await http().get(`${SAVES}/${story(0)}`),
      await http()
        .patch(`${SAVES}/${story(0)}`)
        .set('Origin', APP_URL)
        .send({ note: 'x' }),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('GET and PATCH answer 404 FEATURE_DISABLED with the flag off', async () => {
    const user = await signInUser(flagOff, 'noteroff');
    for (const response of [
      await user.get(`${SAVES}/${story(0)}`),
      await user.patch(`${SAVES}/${story(0)}`, { note: 'x' }),
    ]) {
      expect(response.status).toBe(404);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('FEATURE_DISABLED');
    }
  });

  it('AC-1.5.9 PATCH answers 403 FORBIDDEN_ORIGIN for a foreign Origin and writes nothing', async () => {
    const user = await signIn();
    await user.put(`${SAVES}/${story(0)}`);
    const response = await user.foreignOrigin('patch', `${SAVES}/${story(0)}`);
    expect(response.status).toBe(403);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('PATCH sets the note and its date, GET reads it back, and null clears both', async () => {
    const user = await signIn();
    await user.put(`${SAVES}/${story(0)}`);
    const set = await user.patch(`${SAVES}/${story(0)}`, { note: '# Plan\n\n- read it' });
    expect(set.status).toBe(200);
    expect(set.headers['cache-control']).toBe('private, no-store');
    const saved = SaveSchema.parse(set.body);
    expect(saved).toMatchObject({ storyId: story(0), note: '# Plan\n\n- read it' });
    expect(saved.noteUpdatedAt).not.toBeNull();

    const read = await user.get(`${SAVES}/${story(0)}`);
    expect(read.status).toBe(200);
    expect(SaveSchema.parse(read.body)).toEqual(saved);

    const cleared = SaveSchema.parse(
      (await user.patch(`${SAVES}/${story(0)}`, { note: null })).body,
    );
    expect(cleared).toMatchObject({ note: null, noteUpdatedAt: null });
  });

  it('PATCH answers 404 NOT_FOUND when the story is not saved, and GET too', async () => {
    const user = await signIn();
    for (const response of [
      await user.patch(`${SAVES}/${story(0)}`, { note: 'x' }),
      await user.patch(`${SAVES}/${UNKNOWN_STORY_ID}`, { note: 'x' }),
      await user.get(`${SAVES}/${story(0)}`),
    ]) {
      expect(response.status).toBe(404);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    }
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(0);
  });

  it('AC-3.4.2 PATCH accepts a note of exactly 20,000 chars and answers 400 for 20,001', async () => {
    const user = await signIn();
    await user.put(`${SAVES}/${story(0)}`);
    const exact = await user.patch(`${SAVES}/${story(0)}`, { note: 'x'.repeat(NOTE_MAX_LENGTH) });
    expect(exact.status).toBe(200);
    const over = await user.patch(`${SAVES}/${story(0)}`, {
      note: 'y'.repeat(NOTE_MAX_LENGTH + 1),
    });
    expect(over.status).toBe(400);
    expect(ApiErrorSchema.parse(over.body).error.code).toBe('VALIDATION_FAILED');
    const stored = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(0) } },
    });
    expect(stored.note).toBe('x'.repeat(NOTE_MAX_LENGTH));
  });

  it('PATCH answers 400 for a missing or non-string note', async () => {
    const user = await signIn();
    await user.put(`${SAVES}/${story(0)}`);
    for (const body of [{}, { note: 5 }]) {
      const response = await user.patch(`${SAVES}/${story(0)}`, body);
      expect(response.status).toBe(400);
    }
  });

  it("a note is private to its user: another user's PATCH and GET see no such save", async () => {
    const owner = await signIn();
    const other = await signIn();
    await owner.put(`${SAVES}/${story(0)}`);
    await owner.patch(`${SAVES}/${story(0)}`, { note: 'mine' });
    expect((await other.get(`${SAVES}/${story(0)}`)).status).toBe(404);
    expect((await other.patch(`${SAVES}/${story(0)}`, { note: 'theirs' })).status).toBe(404);
    const stored = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: owner.userId, storyId: story(0) } },
    });
    expect(stored.note).toBe('mine');
  });

  it('GET /me/saves lists the note and its date with the flag on', async () => {
    const user = await signIn();
    await user.put(`${SAVES}/${story(0)}`);
    await user.put(`${SAVES}/${story(1)}`);
    await user.patch(`${SAVES}/${story(1)}`, { note: 'listed' });
    const page = SavedStoryPageSchema.parse((await user.get(SAVES)).body);
    const byId = new Map(page.items.map((item) => [item.story.id, item]));
    expect(byId.get(story(1))).toMatchObject({ note: 'listed' });
    expect(byId.get(story(1))?.noteUpdatedAt).not.toBeNull();
    expect(byId.get(story(0))).toMatchObject({ note: null, noteUpdatedAt: null });
  });

  it('with the flag off GET /me/saves and PUT /me/saves/:storyId carry no note fields, even for a stored note', async () => {
    const user = await signInUser(flagOff, 'noteroff');
    const put = await user.put(`${SAVES}/${story(0)}`);
    expect(Object.keys(put.body as object).sort()).toEqual(['savedAt', 'storyId']);
    await prisma.save.update({
      where: { userId_storyId: { userId: user.userId, storyId: story(0) } },
      data: { note: 'stored', noteUpdatedAt: new Date() },
    });
    const list = (await user.get(SAVES)).body as { items: object[] };
    expect(Object.keys(list.items[0] ?? {}).sort()).toEqual(['savedAt', 'story']);
    expect(SavedStoryPageSchema.parse(list).items).toHaveLength(1);
  });
});
