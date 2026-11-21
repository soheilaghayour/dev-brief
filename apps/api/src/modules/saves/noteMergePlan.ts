import { NOTE_MAX_LENGTH } from '@devbrief/shared';

export const NOTE_SEPARATOR = '\n\n---\n\n';

type IncomingNote = { storyId: string; note: string; updatedAt: string };

type NoteMergeInput = {
  incoming: readonly IncomingNote[];
  /** The account's notes by storyId; a save without a note is absent or null. */
  existing: ReadonlyMap<string, string | null>;
  knownStoryIds: ReadonlySet<string>;
};

export type NoteMergePlan = {
  toSet: { storyId: string; note: string; noteUpdatedAt: string }[];
  missingStoryIds: string[];
  /** Distinct incoming stories that exist and were not skipped, whether or not they changed anything. */
  mergedCount: number;
  /** Stories whose combined note would pass the limit; their server note stays. */
  skippedCount: number;
};

/** The newest incoming note per story, so a story repeated in one request counts once. */
function newestPerStory(incoming: readonly IncomingNote[]) {
  const newest = new Map<string, IncomingNote>();
  for (const note of incoming) {
    const kept = newest.get(note.storyId);
    if (!kept || Date.parse(note.updatedAt) > Date.parse(kept.updatedAt)) {
      newest.set(note.storyId, note);
    }
  }
  return [...newest.values()];
}

/** Decides what a guest → account merge writes for notes: set a missing note, append a conflicting one once, or skip an over-long result. */
export function planNoteMerge({
  incoming,
  existing,
  knownStoryIds,
}: NoteMergeInput): NoteMergePlan {
  const plan: NoteMergePlan = { toSet: [], missingStoryIds: [], mergedCount: 0, skippedCount: 0 };
  for (const local of newestPerStory(incoming)) {
    if (!knownStoryIds.has(local.storyId)) {
      plan.missingStoryIds.push(local.storyId);
      continue;
    }
    const server = existing.get(local.storyId) || null;
    // An empty local note has nothing to add.
    if (local.note === '') {
      plan.mergedCount += 1;
    } else if (server === null) {
      plan.toSet.push({ storyId: local.storyId, note: local.note, noteUpdatedAt: local.updatedAt });
      plan.mergedCount += 1;
    } else if (server.includes(local.note)) {
      // Covers an identical note and a repeated merge: appending again would grow the note forever.
      plan.mergedCount += 1;
    } else {
      const combined = `${server}${NOTE_SEPARATOR}${local.note}`;
      if (combined.length > NOTE_MAX_LENGTH) {
        plan.skippedCount += 1;
      } else {
        plan.toSet.push({ storyId: local.storyId, note: combined, noteUpdatedAt: local.updatedAt });
        plan.mergedCount += 1;
      }
    }
  }
  return plan;
}
