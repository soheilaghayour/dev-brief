import type { INestApplication } from '@nestjs/common';
import { ApiErrorSchema, COLLECTION_ITEMS_MAX } from '@devbrief/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './createTestApp.js';
import { createBareStories, createSource, createStory } from './seedStories.js';
import { signInUser, type SignedInUser } from './signedInUser.js';
import { useTestDatabase } from './testDatabase.js';

const BASE = '/api/v1/me/collections';
const BOARDS = 20;

describe('collections under load', () => {
  let app: INestApplication;
  let storyIds: string[];
  const prisma = useTestDatabase();

  async function expectDense(collectionId: string) {
    const rows = await prisma.collectionItem.findMany({
      where: { collectionId },
      orderBy: { position: 'asc' },
      select: { position: true },
    });
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index));
  }

  /** Gives the user `BOARDS` boards of `COLLECTION_ITEMS_MAX` items each, with the same stories in the same order. */
  async function fillBoards(user: SignedInUser) {
    await prisma.save.createMany({
      data: storyIds.map((storyId) => ({ userId: user.userId, storyId })),
    });
    const boardIds: string[] = [];
    for (let board = 0; board < BOARDS; board += 1) {
      const created = await prisma.collection.create({
        data: {
          userId: user.userId,
          name: `Board ${board}`,
          slug: `board-${board}`,
          position: board,
        },
      });
      boardIds.push(created.id);
      await prisma.collectionItem.createMany({
        data: storyIds.map((storyId, position) => ({
          collectionId: created.id,
          userId: user.userId,
          storyId,
          position,
        })),
      });
    }
    return boardIds;
  }

  beforeAll(async () => {
    app = await createTestApp([], { AUTH_TEST_MODE: 'true', FEATURE_COLLECTIONS: 'true' });
    storyIds = await createBareStories(prisma, COLLECTION_ITEMS_MAX, 'scale');
  });
  afterAll(async () => {
    await app.close();
  });

  it('unsaving a story on 20 boards of 500 items finishes in under 1 s and leaves every board dense', async () => {
    const user = await signInUser(app, 'unsaver');
    const boardIds = await fillBoards(user);
    const started = performance.now();
    const response = await user.del(`/api/v1/me/saves/${storyIds[0]}`);
    const elapsed = performance.now() - started;
    expect(response.status).toBe(204);
    expect(elapsed).toBeLessThan(1000);
    for (const boardId of boardIds) {
      await expectDense(boardId);
      expect(await prisma.collectionItem.count({ where: { collectionId: boardId } })).toBe(
        COLLECTION_ITEMS_MAX - 1,
      );
    }
  });

  it('15 concurrent moves by one user never block another user, and each answers 200 or a retryable 409', async () => {
    const user = await signInUser(app, 'mover');
    const other = await signInUser(app, 'bystander');
    const [boardId] = await fillBoards(user);
    const writes = Promise.all(
      Array.from({ length: 15 }, (_, index) =>
        user.put(`${BASE}/${boardId}/items/${storyIds[index + 1]}`, { position: 0 }),
      ),
    );
    const started = performance.now();
    const read = await other.get('/api/v1/me/saves/ids');
    const elapsed = performance.now() - started;
    expect(read.status).toBe(200);
    expect(elapsed).toBeLessThan(200);
    for (const response of await writes) {
      expect([200, 409]).toContain(response.status);
      if (response.status === 409) {
        expect(ApiErrorSchema.parse(response.body).error.code).toBe('CONFLICT');
      }
    }
    await expectDense(boardId ?? '');
  });

  it('a merge and a move of the same story in parallel, 20 times, never answer 5xx', async () => {
    const source = await createSource(prisma, 'race-blog', 'rss');
    const raced = await createStory(prisma, {
      title: 'Raced story',
      publishedAt: new Date(Date.UTC(2026, 0, 2)),
      itemSourceIds: [source.id],
    });
    // A fresh user per round: the merge route allows 10 requests a minute per user.
    for (let round = 0; round < 20; round += 1) {
      const user = await signInUser(app, 'racer');
      const board = await prisma.collection.create({
        data: { userId: user.userId, name: 'Race', slug: 'race', position: 0 },
      });
      const [merged, moved] = await Promise.all([
        user.post('/api/v1/me/merge', {
          version: 1,
          saves: [],
          collections: [
            { slug: 'race', name: 'Race', items: [{ storyId: raced.id, position: 0 }] },
          ],
          notes: [{ storyId: raced.id, note: 'note', updatedAt: '2026-03-01T00:00:00.000Z' }],
        }),
        user.put(`${BASE}/${board.id}/items/${raced.id}`, { position: 0 }),
      ]);
      expect([200, 409]).toContain(merged.status);
      expect([200, 409]).toContain(moved.status);
      await expectDense(board.id);
    }
  });
});
