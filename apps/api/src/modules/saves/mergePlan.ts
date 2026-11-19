import type { Save } from '@devbrief/shared';

type MergePlanInput = {
  incoming: readonly Save[];
  /** The account's saves among the incoming ids: storyId to savedAt. */
  existing: ReadonlyMap<string, string>;
  knownStoryIds: ReadonlySet<string>;
};

export type MergePlan = {
  toCreate: Save[];
  /** Incoming saves dated earlier than the account's own. */
  toMoveEarlier: Save[];
  missingStoryIds: string[];
  /** Distinct incoming stories that exist, whether or not they changed anything. */
  mergedCount: number;
};

/** The earliest incoming save per story, so a story repeated in one request counts once. */
function earliestPerStory(incoming: readonly Save[]) {
  const earliest = new Map<string, Save>();
  for (const save of incoming) {
    const kept = earliest.get(save.storyId);
    if (!kept || Date.parse(save.savedAt) < Date.parse(kept.savedAt)) {
      earliest.set(save.storyId, save);
    }
  }
  return [...earliest.values()];
}

/** Decides what a guest → account merge writes: new saves, earlier dates and unknown stories; a save that is already as early changes nothing. */
export function planSaveMerge({ incoming, existing, knownStoryIds }: MergePlanInput): MergePlan {
  const plan: MergePlan = { toCreate: [], toMoveEarlier: [], missingStoryIds: [], mergedCount: 0 };
  for (const save of earliestPerStory(incoming)) {
    if (!knownStoryIds.has(save.storyId)) {
      plan.missingStoryIds.push(save.storyId);
      continue;
    }
    plan.mergedCount += 1;
    const savedAt = existing.get(save.storyId);
    if (savedAt === undefined) plan.toCreate.push(save);
    else if (Date.parse(save.savedAt) < Date.parse(savedAt)) plan.toMoveEarlier.push(save);
  }
  return plan;
}
