type IncomingCollection = {
  slug: string;
  name: string;
  items: readonly { storyId: string; position: number }[];
};

type CollectionMergeInput = {
  incoming: readonly IncomingCollection[];
  /** The account's collections among the incoming slugs. */
  existing: ReadonlyMap<string, { storyIds: ReadonlySet<string>; itemCount: number }>;
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
  /** Distinct incoming slugs, whether or not they changed anything. */
  mergedCount: number;
};

/** One entry per slug: the first name wins and the items of repeats join it. */
function groupBySlug(incoming: readonly IncomingCollection[]) {
  const grouped = new Map<
    string,
    { name: string; items: { storyId: string; position: number }[] }
  >();
  for (const collection of incoming) {
    const kept = grouped.get(collection.slug);
    if (kept) kept.items.push(...collection.items);
    else grouped.set(collection.slug, { name: collection.name, items: [...collection.items] });
  }
  return grouped;
}

/** Decides what a guest → account merge writes for collections: matched by slug, new ones at the end, missing items appended in the guest's order. */
export function planCollectionMerge({
  incoming,
  existing,
  nextCollectionPosition,
  knownStoryIds,
}: CollectionMergeInput): CollectionMergePlan {
  const plan: CollectionMergePlan = { collections: [], missingStoryIds: [], mergedCount: 0 };
  let nextPosition = nextCollectionPosition;
  for (const [slug, { name, items }] of groupBySlug(incoming)) {
    const account = existing.get(slug);
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
      itemsToAdd.push({ storyId, position: nextItemPosition });
      nextItemPosition += 1;
    }
    plan.mergedCount += 1;
    if (account) {
      plan.collections.push({ slug, name, isNew: false, position: 0, itemsToAdd });
    } else {
      plan.collections.push({ slug, name, isNew: true, position: nextPosition, itemsToAdd });
      nextPosition += 1;
    }
  }
  return plan;
}
