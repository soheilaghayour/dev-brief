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
import { closeItemGap, moveItem } from '../../common/collections/itemOrder.js';
import { clampPosition, positionShift } from '../../common/collections/positionShift.js';
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

/** Moves one of a user's collections to `requested` (clamped) with one range shift and one update; `updateMany` leaves `updatedAt` alone on the shifted rows. */
async function moveCollection(
  tx: Prisma.TransactionClient,
  userId: string,
  id: string,
  from: number,
  requested: number,
) {
  const count = await tx.collection.count({ where: { userId } });
  const to = clampPosition(requested, count);
  const shift = positionShift(from, to);
  if (!shift) return;
  await tx.collection.updateMany({
    where: { userId, position: shift.range },
    data: { position: shift.by === 1 ? { increment: 1 } : { decrement: 1 } },
  });
  await tx.collection.updateMany({ where: { id, userId }, data: { position: to } });
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
      const owned = await tx.collection.findFirst({
        where: { id, userId },
        select: { position: true },
      });
      if (!owned) throw notFound();
      await tx.collection.update({
        where: { id },
        data: { name, description },
        select: { id: true },
      });
      if (position !== undefined) {
        await moveCollection(tx, userId, id, owned.position, position);
      }
      return toCollection(
        await tx.collection.findUniqueOrThrow({ where: { id }, include: WITH_ITEM_COUNT }),
      );
    });
  }

  async remove(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockCollectionWrites(tx, userId);
      const removed = await tx.collection.findFirst({
        where: { id, userId },
        select: { position: true },
      });
      if (!removed) throw notFound();
      await tx.collection.delete({ where: { id }, select: { id: true } });
      await tx.collection.updateMany({
        where: { userId, position: { gt: removed.position } },
        data: { position: { decrement: 1 } },
      });
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
      const items = await tx.collectionItem.findMany({
        where: { collectionId: id },
        select: { storyId: true, position: true },
      });
      const current = items.find((item) => item.storyId === storyId);
      const itemPosition = current?.position ?? items.length;
      if (!current) {
        if (items.length >= COLLECTION_ITEMS_MAX) {
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
            position: itemPosition,
          },
        });
      }
      if (position !== undefined) {
        await moveItem(
          tx,
          { collectionId: id, storyId },
          itemPosition,
          position,
          items.length + (current ? 0 : 1),
        );
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
      const item = await tx.collectionItem.findUnique({
        where: { collectionId_storyId: { collectionId: id, storyId } },
        select: { position: true },
      });
      if (!item) return;
      await tx.collectionItem.delete({
        where: { collectionId_storyId: { collectionId: id, storyId } },
        select: { storyId: true },
      });
      await closeItemGap(tx, id, item.position);
    });
  }
}
