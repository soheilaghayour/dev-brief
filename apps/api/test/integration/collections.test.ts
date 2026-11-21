import type { INestApplication } from '@nestjs/common';
import {
  ApiErrorSchema,
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  CollectionDetailSchema,
  CollectionListSchema,
  CollectionSchema,
  SaveSchema,
} from '@devbrief/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/env.js';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { signInUser, type SignedInUser } from './signedInUser.js';
import { useTestDatabase } from './testDatabase.js';

const APP_URL = loadEnv().APP_URL;
const BASE = '/api/v1/me/collections';
const UNKNOWN_STORY_ID = 'cunknownstoryxxxxxxxxxx';
const UNKNOWN_COLLECTION_ID = 'cunknowncollectionxxxxx';

describe('collections', () => {
  let app: INestApplication;
  let flagOff: INestApplication;
  let storyIds: string[];
  const prisma = useTestDatabase();
  const story = (index: number) => storyIds[index] ?? '';
  const signIn = () => signInUser(app, 'collector');

  async function createCollection(user: SignedInUser, name: string) {
    const response = await user.post(BASE, { name });
    expect(response.status).toBe(201);
    return CollectionSchema.parse(response.body);
  }

  async function itemOrder(collectionId: string) {
    const rows = await prisma.collectionItem.findMany({
      where: { collectionId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => [row.storyId, row.position] as const);
  }

  beforeAll(async () => {
    app = await createTestApp([], { AUTH_TEST_MODE: 'true', FEATURE_COLLECTIONS: 'true' });
    flagOff = await createTestApp([], { AUTH_TEST_MODE: 'true', FEATURE_COLLECTIONS: 'false' });
    const source = await createSource(prisma, 'collections-blog', 'rss');
    const stories = [];
    for (const [index, title] of ['Alpha', 'Bravo', 'Charlie', 'Delta'].entries()) {
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

  it('every collections route answers 401 UNAUTHENTICATED without a session', async () => {
    const http = () => request(app.getHttpServer());
    const id = UNKNOWN_COLLECTION_ID;
    const responses = [
      await http().get(BASE),
      await http().post(BASE).set('Origin', APP_URL).send({ name: 'x' }),
      await http().get(`${BASE}/${id}`),
      await http().patch(`${BASE}/${id}`).set('Origin', APP_URL).send({}),
      await http().delete(`${BASE}/${id}`).set('Origin', APP_URL),
      await http()
        .put(`${BASE}/${id}/items/${story(0)}`)
        .set('Origin', APP_URL)
        .send({}),
      await http()
        .delete(`${BASE}/${id}/items/${story(0)}`)
        .set('Origin', APP_URL),
    ];
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('every collections route answers 404 FEATURE_DISABLED with the flag off', async () => {
    const user = await signInUser(flagOff, 'flagoff');
    const id = UNKNOWN_COLLECTION_ID;
    const responses = [
      await user.get(BASE),
      await user.post(BASE, { name: 'x' }),
      await user.get(`${BASE}/${id}`),
      await user.patch(`${BASE}/${id}`, {}),
      await user.del(`${BASE}/${id}`),
      await user.put(`${BASE}/${id}/items/${story(0)}`),
      await user.del(`${BASE}/${id}/items/${story(0)}`),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('FEATURE_DISABLED');
    }
  });

  it('AC-1.5.9 every collections mutation answers 403 FORBIDDEN_ORIGIN for a foreign Origin', async () => {
    const user = await signIn();
    const collection = await createCollection(user, 'Origin');
    const responses = [
      await user.foreignOrigin('post', BASE),
      await user.foreignOrigin('patch', `${BASE}/${collection.id}`),
      await user.foreignOrigin('delete', `${BASE}/${collection.id}`),
      await user.foreignOrigin('put', `${BASE}/${collection.id}/items/${story(0)}`),
      await user.foreignOrigin('delete', `${BASE}/${collection.id}/items/${story(0)}`),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('FORBIDDEN_ORIGIN');
    }
    expect(await prisma.collection.count({ where: { id: collection.id } })).toBe(1);
  });

  it('POST answers 201 with a Collection at the end, a slug from the name, private and never stored', async () => {
    const user = await signIn();
    const first = await user.post(BASE, { name: 'Read later', description: 'Soon' });
    expect(first.status).toBe(201);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(CollectionSchema.parse(first.body)).toMatchObject({
      name: 'Read later',
      slug: 'read-later',
      description: 'Soon',
      position: 0,
      itemCount: 0,
    });
    const second = await createCollection(user, 'Read later');
    expect(second).toMatchObject({ slug: 'read-later-2', position: 1, description: null });
  });

  it('POST answers 400 VALIDATION_FAILED for an empty name, a 61-char name and a 501-char description', async () => {
    const user = await signIn();
    for (const body of [
      { name: '  ' },
      { name: 'x'.repeat(61) },
      { name: 'ok', description: 'x'.repeat(501) },
    ]) {
      const response = await user.post(BASE, body);
      expect(response.status).toBe(400);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('GET lists the user collections by position, with item counts, and no other user', async () => {
    const user = await signIn();
    const other = await signIn();
    const a = await createCollection(user, 'A');
    const b = await createCollection(user, 'B');
    await createCollection(other, 'Not mine');
    await user.put(`${BASE}/${b.id}/items/${story(0)}`);
    const response = await user.get(BASE);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const list = CollectionListSchema.parse(response.body);
    expect(list.items.map((item) => [item.id, item.itemCount])).toEqual([
      [a.id, 0],
      [b.id, 1],
    ]);
  });

  it('answers 400 for the 51st collection of a user', async () => {
    const user = await signIn();
    await prisma.collection.createMany({
      data: Array.from({ length: COLLECTIONS_MAX }, (_, index) => ({
        userId: user.userId,
        name: `C${index}`,
        slug: `c${index}`,
        position: index,
      })),
    });
    const response = await user.post(BASE, { name: 'One too many' });
    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining(String(COLLECTIONS_MAX)),
    });
  });

  it('PATCH renames and describes, keeping the slug, and clears the description with null', async () => {
    const user = await signIn();
    const created = await createCollection(user, 'Old name');
    const renamed = await user.patch(`${BASE}/${created.id}`, {
      name: 'New name',
      description: 'About',
    });
    expect(renamed.status).toBe(200);
    expect(CollectionSchema.parse(renamed.body)).toMatchObject({
      name: 'New name',
      slug: 'old-name',
      description: 'About',
    });
    const cleared = await user.patch(`${BASE}/${created.id}`, { description: null });
    expect(CollectionSchema.parse(cleared.body).description).toBeNull();
    const invalid = await user.patch(`${BASE}/${created.id}`, { position: -1 });
    expect(invalid.status).toBe(400);
  });

  it('PATCH position moves a collection and renumbers the others densely', async () => {
    const user = await signIn();
    const [a, b, c, d] = [
      await createCollection(user, 'A'),
      await createCollection(user, 'B'),
      await createCollection(user, 'C'),
      await createCollection(user, 'D'),
    ];
    const moved = await user.patch(`${BASE}/${d.id}`, { position: 1 });
    expect(CollectionSchema.parse(moved.body).position).toBe(1);
    await user.patch(`${BASE}/${a.id}`, { position: 99 });
    const list = CollectionListSchema.parse((await user.get(BASE)).body);
    expect(list.items.map((item) => [item.id, item.position])).toEqual([
      [d.id, 0],
      [b.id, 1],
      [c.id, 2],
      [a.id, 3],
    ]);
  });

  it('DELETE answers 204, removes the collection and its items but keeps the saves, and closes the gap', async () => {
    const user = await signIn();
    const first = await createCollection(user, 'First');
    const second = await createCollection(user, 'Second');
    await user.put(`${BASE}/${first.id}/items/${story(0)}`);
    const response = await user.del(`${BASE}/${first.id}`);
    expect(response.status).toBe(204);
    expect(await prisma.collectionItem.count({ where: { collectionId: first.id } })).toBe(0);
    expect(await prisma.save.count({ where: { userId: user.userId, storyId: story(0) } })).toBe(1);
    const list = CollectionListSchema.parse((await user.get(BASE)).body);
    expect(list.items.map((item) => [item.id, item.position])).toEqual([[second.id, 0]]);
  });

  it('PUT an item for an unsaved story creates the Save, answers the Collection and is idempotent', async () => {
    const user = await signIn();
    const collection = await createCollection(user, 'Board');
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(0);
    const first = await user.put(`${BASE}/${collection.id}/items/${story(0)}`);
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect(CollectionSchema.parse(first.body).itemCount).toBe(1);
    const save = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(0) } },
    });
    const again = await user.put(`${BASE}/${collection.id}/items/${story(0)}`);
    expect(again.status).toBe(200);
    expect(CollectionSchema.parse(again.body).itemCount).toBe(1);
    const afterwards = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(0) } },
    });
    expect(afterwards.savedAt).toEqual(save.savedAt);
    expect(await itemOrder(collection.id)).toEqual([[story(0), 0]]);
  });

  it('PUT answers 404 for an unknown story and 400 for a malformed story id or position', async () => {
    const user = await signIn();
    const collection = await createCollection(user, 'Board');
    const unknown = await user.put(`${BASE}/${collection.id}/items/${UNKNOWN_STORY_ID}`);
    expect(unknown.status).toBe(404);
    expect(ApiErrorSchema.parse(unknown.body).error.code).toBe('NOT_FOUND');
    const malformed = await user.put(`${BASE}/${collection.id}/items/not-an-id`);
    expect(malformed.status).toBe(400);
    const badPosition = await user.put(`${BASE}/${collection.id}/items/${story(0)}`, {
      position: 'first',
    });
    expect(badPosition.status).toBe(400);
    expect(ApiErrorSchema.parse(badPosition.body).error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(0);
  });

  it('PUT with a position moves an item and renumbers the others densely', async () => {
    const user = await signIn();
    const collection = await createCollection(user, 'Board');
    for (const index of [0, 1, 2]) await user.put(`${BASE}/${collection.id}/items/${story(index)}`);
    await user.put(`${BASE}/${collection.id}/items/${story(2)}`, { position: 0 });
    expect(await itemOrder(collection.id)).toEqual([
      [story(2), 0],
      [story(0), 1],
      [story(1), 2],
    ]);
    await user.put(`${BASE}/${collection.id}/items/${story(3)}`, { position: 1 });
    expect(await itemOrder(collection.id)).toEqual([
      [story(2), 0],
      [story(3), 1],
      [story(0), 2],
      [story(1), 3],
    ]);
  });

  it('answers 400 for the 501st item of a collection, and still accepts a move inside a full one', async () => {
    const user = await signIn();
    const collection = await createCollection(user, 'Full');
    const created = await prisma.story.createManyAndReturn({
      data: Array.from({ length: COLLECTION_ITEMS_MAX }, (_, index) => ({
        canonicalUrl: `https://bulk.example.com/${index}`,
        url: `https://bulk.example.com/${index}`,
        domain: 'bulk.example.com',
        title: `Bulk ${index}`,
        normalizedTitle: `bulk ${index}`,
        publishedAt: new Date(Date.UTC(2026, 0, 1)),
        taggerVersion: 1,
      })),
      select: { id: true },
    });
    await prisma.save.createMany({
      data: created.map(({ id }) => ({ userId: user.userId, storyId: id })),
    });
    await prisma.collectionItem.createMany({
      data: created.map(({ id }, index) => ({
        collectionId: collection.id,
        userId: user.userId,
        storyId: id,
        position: index,
      })),
    });
    const over = await user.put(`${BASE}/${collection.id}/items/${story(0)}`);
    expect(over.status).toBe(400);
    expect(ApiErrorSchema.parse(over.body).error.code).toBe('VALIDATION_FAILED');
    expect(await prisma.collectionItem.count({ where: { collectionId: collection.id } })).toBe(
      COLLECTION_ITEMS_MAX,
    );
    const move = await user.put(`${BASE}/${collection.id}/items/${created[10]!.id}`, {
      position: 0,
    });
    expect(move.status).toBe(200);
  });

  it('DELETE an item answers 204, is idempotent and closes the gap', async () => {
    const user = await signIn();
    const collection = await createCollection(user, 'Board');
    for (const index of [0, 1, 2]) await user.put(`${BASE}/${collection.id}/items/${story(index)}`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await user.del(`${BASE}/${collection.id}/items/${story(0)}`);
      expect(response.status).toBe(204);
    }
    expect(await itemOrder(collection.id)).toEqual([
      [story(1), 0],
      [story(2), 1],
    ]);
    expect(await prisma.save.count({ where: { userId: user.userId, storyId: story(0) } })).toBe(1);
  });

  it('GET one collection answers its items in position order with the story card and note', async () => {
    const user = await signIn();
    const collection = await createCollection(user, 'Board');
    await user.put(`${BASE}/${collection.id}/items/${story(0)}`);
    await user.put(`${BASE}/${collection.id}/items/${story(1)}`, { position: 0 });
    await user.patch(`/api/v1/me/saves/${story(0)}`, { note: '# Thoughts' });
    const response = await user.get(`${BASE}/${collection.id}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const detail = CollectionDetailSchema.parse(response.body);
    expect(detail.collection.itemCount).toBe(2);
    expect(detail.items.map((item) => [item.story.id, item.position, item.note])).toEqual([
      [story(1), 0, null],
      [story(0), 1, '# Thoughts'],
    ]);
    expect(detail.items[1]?.noteUpdatedAt).not.toBeNull();
  });

  it('a foreign collection id answers 404 NOT_FOUND on every route, never 403, and changes nothing', async () => {
    const owner = await signIn();
    const intruder = await signIn();
    const collection = await createCollection(owner, 'Private');
    await owner.put(`${BASE}/${collection.id}/items/${story(0)}`);
    const id = collection.id;
    const responses = [
      await intruder.get(`${BASE}/${id}`),
      await intruder.patch(`${BASE}/${id}`, { name: 'Hijacked', position: 0 }),
      await intruder.del(`${BASE}/${id}`),
      await intruder.put(`${BASE}/${id}/items/${story(1)}`),
      await intruder.del(`${BASE}/${id}/items/${story(0)}`),
      await intruder.get(`${BASE}/${UNKNOWN_COLLECTION_ID}`),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe('NOT_FOUND');
    }
    const row = await prisma.collection.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe('Private');
    expect(await itemOrder(id)).toEqual([[story(0), 0]]);
    expect(await prisma.save.count({ where: { userId: intruder.userId } })).toBe(0);
  });

  it("an item always belongs to the collection owner: another user's save can't be added to my collection", async () => {
    const mine = await signIn();
    const theirs = await signIn();
    const myCollection = await createCollection(mine, 'Mine');
    const theirCollection = await createCollection(theirs, 'Theirs');
    // They saved the story and put it on their board; I never saved it.
    await theirs.put(`${BASE}/${theirCollection.id}/items/${story(0)}`);

    // Adding the same story to my board, even with their id smuggled into the body, saves it for me.
    const response = await mine.put(`${BASE}/${myCollection.id}/items/${story(0)}`, {
      userId: theirs.userId,
      position: 0,
    });
    expect(response.status).toBe(200);
    const myItems = await prisma.collectionItem.findMany({
      where: { collectionId: myCollection.id },
    });
    expect(myItems).toHaveLength(1);
    expect(myItems[0]?.userId).toBe(mine.userId);
    expect(await prisma.save.count({ where: { userId: mine.userId, storyId: story(0) } })).toBe(1);

    // Their save is untouched and my board can't reach their collection.
    const theirItems = await prisma.collectionItem.findMany({
      where: { collectionId: theirCollection.id },
    });
    expect(theirItems.map((item) => item.userId)).toEqual([theirs.userId]);
    const intoTheirs = await mine.put(`${BASE}/${theirCollection.id}/items/${story(1)}`);
    expect(intoTheirs.status).toBe(404);
    expect(await prisma.save.count({ where: { userId: theirs.userId } })).toBe(1);

    // Every item in the database has the owner of its collection.
    const items = await prisma.collectionItem.findMany({ include: { collection: true } });
    for (const item of items) expect(item.userId).toBe(item.collection.userId);
  });

  it('AC-3.4.1 unsaving a story removes it from every collection, deletes its note and closes the gaps', async () => {
    const user = await signIn();
    const first = await createCollection(user, 'First');
    const second = await createCollection(user, 'Second');
    for (const id of [first.id, second.id]) {
      for (const index of [0, 1, 2]) await user.put(`${BASE}/${id}/items/${story(index)}`);
    }
    await user.patch(`/api/v1/me/saves/${story(1)}`, { note: 'to be deleted' });

    const response = await user.del(`/api/v1/me/saves/${story(1)}`);
    expect(response.status).toBe(204);

    expect(
      await prisma.collectionItem.count({ where: { userId: user.userId, storyId: story(1) } }),
    ).toBe(0);
    expect(await itemOrder(first.id)).toEqual([
      [story(0), 0],
      [story(2), 1],
    ]);
    expect(await itemOrder(second.id)).toEqual([
      [story(0), 0],
      [story(2), 1],
    ]);
    // Saving it again starts without the old note.
    const saved = SaveSchema.parse((await user.put(`/api/v1/me/saves/${story(1)}`)).body);
    expect(saved.note).toBeNull();
  });
});
