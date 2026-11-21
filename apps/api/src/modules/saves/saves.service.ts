import { Inject, Injectable } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  type MergeRequest,
  type MergeResponse,
  type PaginationQuery,
  type Preferences,
  type Save,
  type SaveIds,
  type SaveNotePatch,
  type SavedStoryPage,
} from '@devbrief/shared';
import { lockCollectionWrites } from '../../common/collections/collectionWriteLock.js';
import { closeItemGap } from '../../common/collections/itemOrder.js';
import { ENV, type Env } from '../../common/env/env.module.js';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { lockPreferenceWrites } from '../../common/preferences/preferenceWriteLock.js';
import { toStoryCards } from '../../common/story-card/clusterCards.js';
import {
  type StoryFeatures,
  storyFeatures,
  storyWithItems,
} from '../../common/story-card/storyCard.mapper.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { planCollectionMerge } from './collectionMergePlan.js';
import { planSaveMerge } from './mergePlan.js';
import { planNoteMerge } from './noteMergePlan.js';
import { planPreferenceMerge } from './preferenceMergePlan.js';

const CURSOR_SORT = 'saved';

/** A saves cursor holds the save's date and story id. */
function parseSavedCursor(cursor: string) {
  const [savedAtText, storyId] = decodeCursor(cursor, CURSOR_SORT).k;
  const savedAt = new Date(savedAtText);
  if (typeof savedAtText !== 'string' || Number.isNaN(savedAt.getTime())) {
    throw new InvalidCursorError();
  }
  return { savedAt, storyId };
}

type SaveRow = { storyId: string; savedAt: Date; note: string | null; noteUpdatedAt: Date | null };

/** The note fields are left out while the collections flag is off, so flag-off responses match Phase 2. */
function noteFields(save: SaveRow, collectionsOn: boolean) {
  return collectionsOn
    ? { note: save.note, noteUpdatedAt: save.noteUpdatedAt?.toISOString() ?? null }
    : {};
}

function toSave(save: SaveRow, collectionsOn: boolean): Save {
  return {
    storyId: save.storyId,
    savedAt: save.savedAt.toISOString(),
    ...noteFields(save, collectionsOn),
  };
}

/** Adds the guest's preferences the account lacks inside the merge transaction; answers `merged.preferences`. */
async function mergePreferences(
  tx: Prisma.TransactionClient,
  userId: string,
  preferences: Preferences,
) {
  // Read under the lock, so a concurrent PUT or merge can't change the set the plan is based on.
  await lockPreferenceWrites(tx, userId);
  const existing = await tx.feedPreference.findMany({
    where: { userId },
    select: { kind: true, value: true, mode: true },
  });
  const plan = planPreferenceMerge({ incoming: preferences, existing });
  await tx.feedPreference.createMany({
    data: plan.toCreate.map((entry) => ({ userId, ...entry })),
  });
  return plan.mergedCount;
}

type MergeContext = { tx: Prisma.TransactionClient; userId: string; knownStoryIds: Set<string> };

/** Merges guest collections by slug inside the merge transaction; answers the plan's counts and unknown stories. */
async function mergeCollections(
  { tx, userId, knownStoryIds }: MergeContext,
  incoming: NonNullable<MergeRequest['collections']>,
) {
  const accountCollections = await tx.collection.findMany({
    where: { userId },
    select: { id: true, slug: true, position: true, items: { select: { storyId: true } } },
  });
  const bySlug = new Map(accountCollections.map((collection) => [collection.slug, collection]));
  const plan = planCollectionMerge({
    incoming,
    existing: new Map(
      accountCollections.map((collection) => [
        collection.slug,
        {
          storyIds: new Set(collection.items.map((item) => item.storyId)),
          itemCount: collection.items.length,
        },
      ]),
    ),
    accountCollectionCount: accountCollections.length,
    nextCollectionPosition: accountCollections.reduce(
      (next, collection) => Math.max(next, collection.position + 1),
      0,
    ),
    knownStoryIds,
  });
  // A CollectionItem points at its owner's Save, so the story is saved first.
  const itemStoryIds = [
    ...new Set(plan.collections.flatMap((c) => c.itemsToAdd.map((item) => item.storyId))),
  ];
  await tx.save.createMany({
    data: itemStoryIds.map((storyId) => ({ userId, storyId })),
    skipDuplicates: true,
  });
  for (const planned of plan.collections) {
    const collectionId =
      bySlug.get(planned.slug)?.id ??
      (
        await tx.collection.create({
          data: {
            userId,
            slug: planned.slug,
            name: planned.name,
            position: planned.position,
          },
          select: { id: true },
        })
      ).id;
    await tx.collectionItem.createMany({
      data: planned.itemsToAdd.map((item) => ({ collectionId, userId, ...item })),
      skipDuplicates: true,
    });
  }
  return plan;
}

/** Merges guest notes inside the merge transaction; answers the plan's counts and unknown stories. */
async function mergeNotes(
  { tx, userId, knownStoryIds }: MergeContext,
  incoming: NonNullable<MergeRequest['notes']>,
) {
  const saves = await tx.save.findMany({
    where: { userId, storyId: { in: incoming.map((note) => note.storyId) } },
    select: { storyId: true, note: true },
  });
  const plan = planNoteMerge({
    incoming,
    existing: new Map(saves.map((save) => [save.storyId, save.note])),
    knownStoryIds,
  });
  // Sorted so two concurrent merges write in the same order and can't deadlock.
  const toSet = [...plan.toSet].sort((a, b) => a.storyId.localeCompare(b.storyId));
  for (const { storyId, note, noteUpdatedAt } of toSet) {
    await tx.save.upsert({
      where: { userId_storyId: { userId, storyId } },
      create: { userId, storyId, note, noteUpdatedAt: new Date(noteUpdatedAt) },
      update: { note, noteUpdatedAt: new Date(noteUpdatedAt) },
    });
  }
  return plan;
}

/** Room for the worst case: 500 saves moving earlier plus 500 note upserts, one round trip each (about 1 s locally). */
const MERGE_TRANSACTION_TIMEOUT_MS = 15_000;

@Injectable()
export class SavesService {
  private readonly features: StoryFeatures;
  private readonly collectionsOn: boolean;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) env: Env,
  ) {
    this.features = storyFeatures(env);
    this.collectionsOn = env.FEATURE_COLLECTIONS;
  }

  async list(userId: string, { cursor, limit }: PaginationQuery): Promise<SavedStoryPage> {
    const keyset = cursor ? parseSavedCursor(cursor) : undefined;
    const rows = await this.prisma.save.findMany({
      where: {
        userId,
        ...(keyset && {
          OR: [
            { savedAt: { lt: keyset.savedAt } },
            { savedAt: keyset.savedAt, storyId: { lt: keyset.storyId } },
          ],
        }),
      },
      include: { story: { include: storyWithItems } },
      orderBy: [{ savedAt: 'desc' }, { storyId: 'desc' }],
      take: limit + 1,
    });
    const pageRows = rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    const cards = await toStoryCards(
      this.prisma,
      pageRows.map((row) => row.story),
      this.features,
    );
    return {
      items: pageRows.map((row, index) => ({
        story: cards[index]!,
        savedAt: row.savedAt.toISOString(),
        ...noteFields(row, this.collectionsOn),
      })),
      nextCursor:
        rows.length > limit && lastRow
          ? encodeCursor(CURSOR_SORT, lastRow.savedAt.toISOString(), lastRow.storyId)
          : null,
    };
  }

  async ids(userId: string): Promise<SaveIds> {
    const rows = await this.prisma.save.findMany({
      where: { userId },
      select: { storyId: true },
      orderBy: [{ savedAt: 'desc' }, { storyId: 'desc' }],
    });
    return { ids: rows.map((row) => row.storyId) };
  }

  async get(userId: string, storyId: string): Promise<Save> {
    const save = await this.prisma.save.findUnique({
      where: { userId_storyId: { userId, storyId } },
    });
    if (!save) throw new ApiException('NOT_FOUND', 'Story is not saved.');
    return toSave(save, this.collectionsOn);
  }

  /** Sets or clears the note of a saved story; an empty note counts as cleared. */
  async setNote(userId: string, storyId: string, { note }: SaveNotePatch): Promise<Save> {
    const text = note === '' ? null : note;
    const { count } = await this.prisma.save.updateMany({
      where: { userId, storyId },
      data: { note: text, noteUpdatedAt: text === null ? null : new Date() },
    });
    if (count === 0) throw new ApiException('NOT_FOUND', 'Story is not saved.');
    return this.get(userId, storyId);
  }

  /** Saves the story; saving again keeps the first savedAt. */
  async save(userId: string, storyId: string): Promise<Save> {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true },
    });
    if (!story) throw new ApiException('NOT_FOUND', 'Story not found.');
    const save = await this.prisma.save.upsert({
      where: { userId_storyId: { userId, storyId } },
      create: { userId, storyId },
      update: {},
    });
    return toSave(save, this.collectionsOn);
  }

  /** Removes the save and its note; its collection items cascade, then each board closes the gap. */
  async unsave(userId: string, storyId: string) {
    await this.prisma.$transaction(async (tx) => {
      await lockCollectionWrites(tx, userId);
      const items = await tx.collectionItem.findMany({
        where: { userId, storyId },
        select: { collectionId: true, position: true },
      });
      await tx.save.deleteMany({ where: { userId, storyId } });
      for (const { collectionId, position } of items)
        await closeItemGap(tx, collectionId, position);
    });
  }

  async merge(
    userId: string,
    { saves, preferences, collections, notes }: MergeRequest,
  ): Promise<MergeResponse> {
    const storyIds = [
      ...new Set([
        ...saves.map((save) => save.storyId),
        ...(collections ?? []).flatMap((collection) =>
          collection.items.map((item) => item.storyId),
        ),
        ...(notes ?? []).map((note) => note.storyId),
      ]),
    ];
    const saveStoryIds = [...new Set(saves.map((save) => save.storyId))];
    const result = await this.prisma.$transaction(
      async (tx) => {
        // First statement, as in every other collection write: a merge that locked later would take save rows before the lock another writer holds while it waits for them.
        if (collections || notes) await lockCollectionWrites(tx, userId);
        const stories = await tx.story.findMany({
          where: { id: { in: storyIds } },
          select: { id: true },
        });
        const knownStoryIds = new Set(stories.map((story) => story.id));
        const existing = await tx.save.findMany({
          where: { userId, storyId: { in: saveStoryIds } },
        });
        const mergePlan = planSaveMerge({
          incoming: saves,
          existing: new Map(existing.map((row) => [row.storyId, row.savedAt.toISOString()])),
          knownStoryIds,
        });
        // Sorted so two concurrent merges insert in the same order and can't deadlock.
        const byStoryId = (a: { storyId: string }, b: { storyId: string }) =>
          a.storyId.localeCompare(b.storyId);
        const toCreate = [...mergePlan.toCreate].sort(byStoryId);
        const { count } = await tx.save.createMany({
          data: toCreate.map((save) => ({
            userId,
            storyId: save.storyId,
            savedAt: new Date(save.savedAt),
          })),
          skipDuplicates: true,
        });
        // Rows a concurrent merge created first were skipped; the conditional update still lets the earliest date win.
        const raced = count < toCreate.length ? toCreate : [];
        const toMoveEarlier = [...mergePlan.toMoveEarlier].sort(byStoryId);
        for (const save of [...raced, ...toMoveEarlier]) {
          const savedAt = new Date(save.savedAt);
          await tx.save.updateMany({
            where: { userId, storyId: save.storyId, savedAt: { gt: savedAt } },
            data: { savedAt },
          });
        }
        const preferenceCount = preferences ? await mergePreferences(tx, userId, preferences) : 0;
        const context = { tx, userId, knownStoryIds };
        return {
          plan: mergePlan,
          preferenceCount,
          collectionPlan: collections ? await mergeCollections(context, collections) : undefined,
          notePlan: notes ? await mergeNotes(context, notes) : undefined,
        };
      },
      { timeout: MERGE_TRANSACTION_TIMEOUT_MS },
    );
    const missingStoryIds = [
      ...new Set([
        ...result.plan.missingStoryIds,
        ...(result.collectionPlan?.missingStoryIds ?? []),
        ...(result.notePlan?.missingStoryIds ?? []),
      ]),
    ];
    return {
      merged: {
        saves: result.plan.mergedCount,
        preferences: result.preferenceCount,
        collections: result.collectionPlan?.mergedCount ?? 0,
        notes: result.notePlan?.mergedCount ?? 0,
      },
      skipped: {
        saves: missingStoryIds.length,
        notes: result.notePlan?.skippedCount ?? 0,
        collections: result.collectionPlan?.skippedCollections ?? 0,
        items: result.collectionPlan?.skippedItems ?? 0,
      },
      missingStoryIds,
    };
  }
}
