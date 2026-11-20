import { Injectable } from '@nestjs/common';
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
  type SavedStoryPage,
} from '@devbrief/shared';
import { ApiException } from '../../common/errors/api.exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { preferenceKey } from '../../common/preferences/preferenceEntries.js';
import { storyWithItems, toStoryCard } from '../../common/story-card/storyCard.mapper.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { planSaveMerge } from './mergePlan.js';
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

function toSave(save: { storyId: string; savedAt: Date }): Save {
  return { storyId: save.storyId, savedAt: save.savedAt.toISOString() };
}

/** Adds the guest's preferences the account lacks inside the merge transaction; answers `merged.preferences`. */
async function mergePreferences(
  tx: Prisma.TransactionClient,
  userId: string,
  preferences: Preferences,
) {
  const existing = await tx.feedPreference.findMany({
    where: { userId },
    select: { kind: true, value: true, mode: true },
  });
  const plan = planPreferenceMerge({ incoming: preferences, existing });
  // Sorted like the saves; a row a concurrent request inserted first is skipped, so the server mode still wins.
  const toCreate = [...plan.toCreate].sort((a, b) =>
    preferenceKey(a).localeCompare(preferenceKey(b)),
  );
  await tx.feedPreference.createMany({
    data: toCreate.map((entry) => ({ userId, ...entry })),
    skipDuplicates: true,
  });
  return plan.mergedCount;
}

/** Room for the worst case: every one of 500 saves moves earlier, one round trip each. */
const MERGE_TRANSACTION_TIMEOUT_MS = 15_000;

@Injectable()
export class SavesService {
  constructor(private readonly prisma: PrismaService) {}

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
    return {
      items: pageRows.map((row) => ({
        story: toStoryCard(row.story),
        savedAt: row.savedAt.toISOString(),
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
    return toSave(save);
  }

  async unsave(userId: string, storyId: string) {
    await this.prisma.save.deleteMany({ where: { userId, storyId } });
  }

  async merge(userId: string, { saves, preferences }: MergeRequest): Promise<MergeResponse> {
    const storyIds = [...new Set(saves.map((save) => save.storyId))];
    const { plan, preferenceCount } = await this.prisma.$transaction(
      async (tx) => {
        const stories = await tx.story.findMany({
          where: { id: { in: storyIds } },
          select: { id: true },
        });
        const existing = await tx.save.findMany({ where: { userId, storyId: { in: storyIds } } });
        const mergePlan = planSaveMerge({
          incoming: saves,
          existing: new Map(existing.map((row) => [row.storyId, row.savedAt.toISOString()])),
          knownStoryIds: new Set(stories.map((story) => story.id)),
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
        return {
          plan: mergePlan,
          preferenceCount: preferences ? await mergePreferences(tx, userId, preferences) : 0,
        };
      },
      { timeout: MERGE_TRANSACTION_TIMEOUT_MS },
    );
    return {
      merged: { saves: plan.mergedCount, preferences: preferenceCount },
      skipped: { saves: plan.missingStoryIds.length },
      missingStoryIds: plan.missingStoryIds,
    };
  }
}
