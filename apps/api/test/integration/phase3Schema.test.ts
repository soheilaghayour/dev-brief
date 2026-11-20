import { describe, expect, it } from 'vitest';
import { createStory } from './seedStories.js';
import { useTestDatabase } from './testDatabase.js';

describe('Phase 3 schema', () => {
  const prisma = useTestDatabase();

  async function saveInTwoCollections(id: string) {
    const user = await prisma.user.create({
      data: { id, name: 'U', email: `${id}@example.com` },
    });
    const story = await createStory(prisma, {
      title: `Saved story ${id}`,
      publishedAt: new Date(),
      itemSourceIds: [],
    });
    await prisma.save.create({
      data: {
        userId: user.id,
        storyId: story.id,
        note: 'worth a re-read',
        noteUpdatedAt: new Date(),
      },
    });
    const collections = await Promise.all(
      ['a', 'b'].map((slug, position) =>
        prisma.collection.create({
          data: {
            userId: user.id,
            name: slug,
            slug,
            position,
            items: { create: { userId: user.id, storyId: story.id, position: 0 } },
          },
        }),
      ),
    );
    return { user, story, collectionIds: collections.map(({ id }) => id) };
  }

  it('deleting a Save deletes its CollectionItem rows in every collection and keeps the collections', async () => {
    const { user, story, collectionIds } = await saveInTwoCollections('save-delete');

    await prisma.save.delete({ where: { userId_storyId: { userId: user.id, storyId: story.id } } });

    expect(await prisma.collectionItem.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.collection.count({ where: { id: { in: collectionIds } } })).toBe(2);
  });

  it('deleting a Collection deletes its items and keeps the saves', async () => {
    const { user, story, collectionIds } = await saveInTwoCollections('collection-delete');

    await prisma.collection.delete({ where: { id: collectionIds[0] } });

    expect(await prisma.collectionItem.count({ where: { collectionId: collectionIds[0] } })).toBe(
      0,
    );
    expect(await prisma.collectionItem.count({ where: { collectionId: collectionIds[1] } })).toBe(
      1,
    );
    const save = await prisma.save.findUniqueOrThrow({
      where: { userId_storyId: { userId: user.id, storyId: story.id } },
    });
    expect(save.note).toBe('worth a re-read');
  });

  it('refuses a CollectionItem for a story the user has not saved', async () => {
    const user = await prisma.user.create({
      data: { id: 'unsaved', name: 'U', email: 'unsaved@example.com' },
    });
    const story = await createStory(prisma, {
      title: 'Unsaved',
      publishedAt: new Date(),
      itemSourceIds: [],
    });
    const collection = await prisma.collection.create({
      data: { userId: user.id, name: 'c', slug: 'c', position: 0 },
    });

    await expect(
      prisma.collectionItem.create({
        data: { collectionId: collection.id, userId: user.id, storyId: story.id, position: 0 },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
