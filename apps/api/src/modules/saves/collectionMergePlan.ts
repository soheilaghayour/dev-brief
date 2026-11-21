import { COLLECTION_ITEMS_MAX, COLLECTIONS_MAX } from '@devbrief/shared';

type IncomingCollection = {
  slug: string;
  name: string;
  items: readonly { storyId: string; position: number }[];
};

type CollectionMergeInput = {
  incoming: readonly IncomingCollection[];
  /** The account's collections among the incoming slugs. */
  existing: ReadonlyMap<string, { storyIds: ReadonlySet<string>; itemCount: number }>;
  /** How many collections the account has in all, not only among the incoming slugs. */
  accountCollectionCount: number;
  /** The position after the account's last collection. */
  nextCollectionPosition: number;
  knownStoryIds: ReadonlySet<string>;
};

export type PlannedCollection = {
  slug: string;
  /** The guest's name; the account's collection keeps its own, so it is used only when `isNew`. */
  name: string;
  isNew: boolean;
  /** Set only when `isNew`. */
  position: number;
  itemsToAdd: { storyId: string; position: number }[];
};

export type CollectionMergePlan = {
  collections: PlannedCollection[];
  missingStoryIds: string[];
  /** Distinct incoming slugs, whether or not they changed anything; skipped collections are not counted. */
  mergedCount: number;
  /** New collections left out because the account is at the collection limit. */
  skippedCollections: number;
  /** Known stories left out because their collection is at the item limit. */
  skippedItems: number;
};

/** Decides what a guest → account merge writes for collections: matched by slug, new ones at the end, missing items appended in the guest's order. */
export function planCollectionMerge({
  incoming,
  existing,
  accountCollectionCount,
  nextCollectionPosition,
  knownStoryIds,
}: CollectionMergeInput): CollectionMergePlan {
  const plan: CollectionMergePlan = {
    collections: [],
    missingStoryIds: [],
    mergedCount: 0,
    skippedCollections: 0,
    skippedItems: 0,
  };
  let nextPosition = nextCollectionPosition;
  let collectionCount = accountCollectionCount;
  for (const { slug, name, items } of incoming) {
    const account = existing.get(slug);
    if (!account && collectionCount >= COLLECTIONS_MAX) {
      plan.skippedCollections += 1;
      continue;
    }
    const present = new Set(account?.storyIds);
    let nextItemPosition = account?.itemCount ?? 0;
    const itemsToAdd: PlannedCollection['itemsToAdd'] = [];
    const ordered = [...items].sort(
      (a, b) => a.position - b.position || a.storyId.localeCompare(b.storyId),
    );
    for (const { storyId } of ordered) {
      if (!knownStoryIds.has(storyId)) {
        if (!plan.missingStoryIds.includes(storyId)) plan.missingStoryIds.push(storyId);
        continue;
      }
      if (present.has(storyId)) continue;
      present.add(storyId);
      if (nextItemPosition >= COLLECTION_ITEMS_MAX) {
        plan.skippedItems += 1;
        continue;
      }
      itemsToAdd.push({ storyId, position: nextItemPosition });
      nextItemPosition += 1;
    }
    plan.mergedCount += 1;
    if (account) {
      plan.collections.push({ slug, name, isNew: false, position: 0, itemsToAdd });
    } else {
      plan.collections.push({ slug, name, isNew: true, position: nextPosition, itemsToAdd });
      nextPosition += 1;
      collectionCount += 1;
    }
  }
  return plan;
}
