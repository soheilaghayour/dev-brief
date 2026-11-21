import type { INestApplication } from '@nestjs/common';
import { MergeResponseSchema, NOTE_MAX_LENGTH } from '@devbrief/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './createTestApp.js';
import { createSource, createStory } from './seedStories.js';
import { signInUser } from './signedInUser.js';
import { useTestDatabase } from './testDatabase.js';

const MERGE = '/api/v1/me/merge';
const UNKNOWN_STORY_ID = 'cunknownstoryxxxxxxxxxx';
const SAVED_AT = '2026-01-01T00:00:00.000Z';
const NOTE_AT = '2026-03-01T00:00:00.000Z';

describe('merging guest collections and notes', () => {
  let app: INestApplication;
  let storyIds: string[];
  const prisma = useTestDatabase();
  const story = (index: number) => storyIds[index] ?? '';
  const signIn = () => signInUser(app, 'merger');

  const body = (extra: object) => ({ version: 1, saves: [], ...extra });
  const guestCollection = (slug: string, name: string, stories: number[]) => ({
    slug,
    name,
    items: stories.map((index, position) => ({ storyId: story(index), position })),
  });

  async function merge(user: Awaited<ReturnType<typeof signIn>>, extra: object) {
    const response = await user.post(MERGE, body(extra));
    expect(response.status).toBe(200);
    return MergeResponseSchema.parse(response.body);
  }

  async function snapshot(userId: string) {
    const [collections, items, saves] = await Promise.all([
      prisma.collection.findMany({ where: { userId }, orderBy: { slug: 'asc' } }),
      prisma.collectionItem.findMany({
        where: { userId },
        orderBy: [{ collectionId: 'asc' }, { storyId: 'asc' }],
      }),
      prisma.save.findMany({ where: { userId }, orderBy: { storyId: 'asc' } }),
    ]);
    return { collections, items, saves };
  }

  beforeAll(async () => {
    // The merge's collections and notes work with the collections flag off.
    app = await createTestApp([], { AUTH_TEST_MODE: 'true', FEATURE_COLLECTIONS: 'false' });
    const source = await createSource(prisma, 'merge-cn-blog', 'rss');
    const stories = [];
    for (const [index, title] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
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
  });

  it('AC-3.4.5 creates guest collections at the end with their items, saving the stories', async () => {
    const user = await signIn();
    await prisma.collection.create({
      data: { userId: user.userId, name: 'Existing', slug: 'existing', position: 0 },
    });
    const result = await merge(user, {
      collections: [guestCollection('rust', 'Rust', [1, 0]), guestCollection('go', 'Go', [])],
    });
    expect(result.merged.collections).toBe(2);
    const collections = await prisma.collection.findMany({
      where: { userId: user.userId },
      orderBy: { position: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    expect(collections.map((c) => [c.slug, c.name, c.position])).toEqual([
      ['existing', 'Existing', 0],
      ['rust', 'Rust', 1],
      ['go', 'Go', 2],
    ]);
    expect(collections[1]?.items.map((i) => [i.storyId, i.position, i.userId])).toEqual([
      [story(1), 0, user.userId],
      [story(0), 1, user.userId],
    ]);
    expect(await prisma.save.count({ where: { userId: user.userId } })).toBe(2);
  });

  it('AC-3.4.5 merges a guest collection into the account one with the same slug, keeping the server name', async () => {
    const user = await signIn();
    const created = await prisma.collection.create({
      data: { userId: user.userId, name: 'Server name', slug: 'rust', position: 0 },
    });
    await prisma.save.create({ data: { userId: user.userId, storyId: story(0) } });
    await prisma.collectionItem.create({
      data: { collectionId: created.id, userId: user.userId, storyId: story(0), position: 0 },
    });

    await merge(user, { collections: [guestCollection('rust', 'Guest name', [0, 1, 2])] });

    const row = await prisma.collection.findUniqueOrThrow({
      where: { id: created.id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    expect(row.name).toBe('Server name');
    expect(row.items.map((i) => [i.storyId, i.position])).toEqual([
      [story(0), 0],
      [story(1), 1],
      [story(2), 2],
    ]);
    expect(await prisma.collection.count({ where: { userId: user.userId } })).toBe(1);
  });

  it('AC-3.4.5 repeating the same merge changes no rows and returns the same counts', async () => {
    const user = await signIn();
    await prisma.save.create({
      data: {
        userId: user.userId,
        storyId: story(2),
        note: 'server note',
        noteUpdatedAt: new Date(NOTE_AT),
      },
    });
    const request = {
      saves: [{ storyId: story(0), savedAt: SAVED_AT }],
      collections: [guestCollection('rust', 'Rust', [0, 1])],
      notes: [
        { storyId: story(0), note: 'fresh local', updatedAt: NOTE_AT },
        { storyId: story(2), note: 'local text', updatedAt: NOTE_AT },
      ],
    };
    const first = await merge(user, request);
    const afterFirst = await snapshot(user.userId);
    const second = await merge(user, request);
    expect(second).toEqual(first);
    expect(await snapshot(user.userId)).toEqual(afterFirst);
    const note = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(2) } },
    });
    expect(note.note).toBe('server note\n\n---\n\nlocal text');
  });

  it('AC-3.4.5 sets a local note when the account has none and leaves an identical note alone', async () => {
    const user = await signIn();
    await prisma.save.create({
      data: {
        userId: user.userId,
        storyId: story(1),
        note: 'same',
        noteUpdatedAt: new Date(SAVED_AT),
      },
    });
    const result = await merge(user, {
      notes: [
        { storyId: story(0), note: 'from guest', updatedAt: NOTE_AT },
        { storyId: story(1), note: 'same', updatedAt: NOTE_AT },
      ],
    });
    expect(result.merged.notes).toBe(2);
    expect(result.skipped.notes).toBe(0);
    const created = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(0) } },
    });
    expect([created.note, created.noteUpdatedAt]).toEqual(['from guest', new Date(NOTE_AT)]);
    const identical = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(1) } },
    });
    expect(identical.noteUpdatedAt).toEqual(new Date(SAVED_AT));
  });

  it('AC-3.4.5 keeps the server note and counts skipped.notes when the combined note is over 20,000 chars', async () => {
    const user = await signIn();
    const server = 'x'.repeat(NOTE_MAX_LENGTH - 5);
    await prisma.save.create({
      data: {
        userId: user.userId,
        storyId: story(0),
        note: server,
        noteUpdatedAt: new Date(SAVED_AT),
      },
    });
    const request = { notes: [{ storyId: story(0), note: 'y'.repeat(100), updatedAt: NOTE_AT }] };
    const first = await merge(user, request);
    expect(first.skipped.notes).toBe(1);
    expect(first.merged.notes).toBe(0);
    const row = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.userId, storyId: story(0) } },
    });
    expect(row.note).toBe(server);
    expect(await merge(user, request)).toEqual(first);
  });

  it('reports unknown stories in collections and notes in missingStoryIds', async () => {
    const user = await signIn();
    const result = await merge(user, {
      collections: [
        {
          slug: 'x',
          name: 'X',
          items: [
            { storyId: UNKNOWN_STORY_ID, position: 0 },
            { storyId: story(0), position: 1 },
          ],
        },
      ],
      notes: [{ storyId: UNKNOWN_STORY_ID, note: 'orphan', updatedAt: NOTE_AT }],
    });
    expect(result.missingStoryIds).toEqual([UNKNOWN_STORY_ID]);
    expect(result.skipped.saves).toBe(1);
    expect(await prisma.collectionItem.count({ where: { userId: user.userId } })).toBe(1);
  });

  it('rejects more than 50 collections, 501 items in a collection and a 20,001-char note with 400', async () => {
    const user = await signIn();
    const tooMany = Array.from({ length: 51 }, (_, index) => guestCollection(`c${index}`, 'C', []));
    const tooManyItems = [
      {
        slug: 'big',
        name: 'Big',
        items: Array.from({ length: 501 }, (_, position) => ({ storyId: story(0), position })),
      },
    ];
    const longNote = [
      { storyId: story(0), note: 'x'.repeat(NOTE_MAX_LENGTH + 1), updatedAt: NOTE_AT },
    ];
    for (const extra of [
      { collections: tooMany },
      { collections: tooManyItems },
      { notes: longNote },
    ]) {
      const response = await user.post(MERGE, body(extra));
      expect(response.status).toBe(400);
    }
    expect(await prisma.collection.count({ where: { userId: user.userId } })).toBe(0);
  });

  it('a merge without collections and notes answers zero counts for them', async () => {
    const user = await signIn();
    const result = await merge(user, { saves: [{ storyId: story(0), savedAt: SAVED_AT }] });
    expect(result.merged).toEqual({ saves: 1, preferences: 0, collections: 0, notes: 0 });
    expect(result.skipped).toEqual({ saves: 0, notes: 0 });
  });
});
