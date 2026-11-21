import { Inject, Injectable } from '@nestjs/common';
import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  collectionSlug,
  type Collection,
  type CollectionCreate,
  type CollectionDetail,
  type CollectionItemPut,
  type CollectionList,
  type CollectionUpdate,
} from '@devbrief/shared';
import { lockCollectionWrites } from '../../common/collections/collectionWriteLock.js';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { toStoryCards } from '../../common/story-card/clusterCards.js';
import {
  type StoryFeatures,
  storyFeatures,
  storyWithItems,
} from '../../common/story-card/storyCard.mapper.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { moveToPosition } from './collectionOrder.js';
import { renumberItems, writeItemOrder } from '../../common/collections/itemOrder.js';

const WITH_ITEM_COUNT = { _count: { select: { items: true } } } satisfies Prisma.CollectionInclude;

type CollectionRow = Prisma.CollectionGetPayload<{ include: typeof WITH_ITEM_COUNT }>;

function toCollection(row: CollectionRow): Collection {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    position: row.position,
    itemCount: row._count.items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function notFound() {
  // The same answer for a missing and a foreign id, so ids don't leak.
  return new ApiException('NOT_FOUND', 'Collection not found.');
}

/** Rewrites the positions of a user's collections to 0..n-1 in the given id order; unchanged rows are left alone. */
async function writeCollectionOrder(tx: Prisma.TransactionClient, userId: string, ids: string[]) {
  const rows = await tx.collection.findMany({
    where: { userId },
    select: { id: true, position: true },
  });
  const current = new Map(rows.map((row) => [row.id, row.position]));
  for (const [position, id] of ids.entries()) {
    if (current.get(id) === position) continue;
    await tx.collection.update({ where: { id }, data: { position }, select: { id: true } });
  }
}

async function orderedCollectionIds(tx: Prisma.TransactionClient, userId: string) {
  const rows = await tx.collection.findMany({
    where: { userId },
    select: { id: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => row.id);
}

async function orderedItemStoryIds(tx: Prisma.TransactionClient, collectionId: string) {
  const rows = await tx.collectionItem.findMany({
    where: { collectionId },
    select: { storyId: true },
    orderBy: [{ position: 'asc' }, { storyId: 'asc' }],
  });
  return rows.map((row) => row.storyId);
}

@Injectable()
export class CollectionsService {
  private readonly features: StoryFeatures;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.features = storyFeatures(env);
  }

  async list(userId: string): Promise<CollectionList> {
    const rows = await this.prisma.collection.findMany({
      where: { userId },
      include: WITH_ITEM_COUNT,
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    });
    return { items: rows.map(toCollection) };
  }

  async create(userId: string, { name, description }: CollectionCreate): Promise<Collection> {
    return this.prisma.$transaction(async (tx) => {
      await lockCollectionWrites(tx, userId);
      const existing = await tx.collection.findMany({
        where: { userId },
        select: { slug: true, position: true },
      });
      if (existing.length >= COLLECTIONS_MAX) {
        throw new ApiException(
          'VALIDATION_FAILED',
          `You can have at most ${COLLECTIONS_MAX} collections.`,
        );
      }
      const row = await tx.collection.create({
        data: {
          userId,
          name,
          description: description ?? null,
          // The slug is fixed here; a rename keeps it, so board links and the merge key stay valid.
          slug: collectionSlug(
            name,
            existing.map((collection) => collection.slug),
          ),
          position: existing.reduce((max, collection) => Math.max(max, collection.position + 1), 0),
        },
        include: WITH_ITEM_COUNT,
      });
      return toCollection(row);
    });
  }

  async update(
    userId: string,
    id: string,
    { name, description, position }: CollectionUpdate,
  ): Promise<Collection> {
    return this.prisma.$transaction(async (tx) => {
      await lockCollectionWrites(tx, userId);
      const owned = await tx.collection.findFirst({ where: { id, userId }, select: { id: true } });
      if (!owned) throw notFound();
      await tx.collection.update({
        where: { id },
        data: { name, description },
        select: { id: true },
      });
      if (position !== undefined) {
        await writeCollectionOrder(
          tx,
          userId,
          moveToPosition(await orderedCollectionIds(tx, userId), id, position),
        );
      }
      return toCollection(
        await tx.collection.findUniqueOrThrow({ where: { id }, include: WITH_ITEM_COUNT }),
      );
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockCollectionWrites(tx, userId);
      const { count } = await tx.collection.deleteMany({ where: { id, userId } });
      if (count === 0) throw notFound();
      await writeCollectionOrder(tx, userId, await orderedCollectionIds(tx, userId));
    });
  }

  async detail(userId: string, id: string): Promise<CollectionDetail> {
    const collection = await this.prisma.collection.findFirst({
      where: { id, userId },
      include: WITH_ITEM_COUNT,
    });
    if (!collection) throw notFound();
    const rows = await this.prisma.collectionItem.findMany({
      where: { collectionId: id },
      include: { save: { include: { story: { include: storyWithItems } } } },
      orderBy: [{ position: 'asc' }, { storyId: 'asc' }],
    });
    const cards = await toStoryCards(
      this.prisma,
      rows.map((row) => row.save.story),
      this.features,
    );
    return {
      collection: toCollection(collection),
      items: rows.map((row, index) => ({
        story: cards[index]!,
        position: row.position,
        addedAt: row.addedAt.toISOString(),
        note: row.save.note,
        noteUpdatedAt: row.save.noteUpdatedAt?.toISOString() ?? null,
      })),
    };
  }

  /** Adds the story to the collection (saving it first if needed) or moves it; the same call twice changes nothing. */
  async putItem(
    userId: string,
    id: string,
    storyId: string,
    { position }: CollectionItemPut,
  ): Promise<Collection> {
    return this.prisma.$transaction(async (tx) => {
      await lockCollectionWrites(tx, userId);
      const collection = await tx.collection.findFirst({
        where: { id, userId },
        select: { id: true, userId: true },
      });
      if (!collection) throw notFound();
      const story = await tx.story.findUnique({ where: { id: storyId }, select: { id: true } });
      if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');
      const itemStoryIds = await orderedItemStoryIds(tx, id);
      if (!itemStoryIds.includes(storyId)) {
        if (itemStoryIds.length >= COLLECTION_ITEMS_MAX) {
          throw new ApiException(
            'VALIDATION_FAILED',
            `A collection can hold at most ${COLLECTION_ITEMS_MAX} stories.`,
          );
        }
        // The owner is the collection's, never the request's: an item can only point at its owner's own save.
        await tx.save.upsert({
          where: { userId_storyId: { userId: collection.userId, storyId } },
          create: { userId: collection.userId, storyId },
          update: {},
        });
        await tx.collectionItem.create({
          data: {
            collectionId: id,
            userId: collection.userId,
            storyId,
            position: itemStoryIds.length,
          },
        });
        itemStoryIds.push(storyId);
      }
      if (position !== undefined) {
        await writeItemOrder(tx, id, moveToPosition(itemStoryIds, storyId, position));
      }
      return toCollection(
        await tx.collection.findUniqueOrThrow({ where: { id }, include: WITH_ITEM_COUNT }),
      );
    });
  }

  async removeItem(userId: string, id: string, storyId: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockCollectionWrites(tx, userId);
      const collection = await tx.collection.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!collection) throw notFound();
      await tx.collectionItem.deleteMany({ where: { collectionId: id, storyId } });
      await renumberItems(tx, id);
    });
  }
}
