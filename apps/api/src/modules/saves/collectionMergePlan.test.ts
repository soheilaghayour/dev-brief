import { COLLECTION_ITEMS_MAX, COLLECTIONS_MAX } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { planCollectionMerge } from './collectionMergePlan.js';

const known = new Set(['a', 'b', 'c']);

describe('planCollectionMerge', () => {
  it('AC-3.4.5 creates a collection the account lacks at the end, with the guest order', () => {
    const plan = planCollectionMerge({
      incoming: [
        {
          slug: 'rust',
          name: 'Rust',
          items: [
            { storyId: 'b', position: 5 },
            { storyId: 'a', position: 1 },
          ],
        },
      ],
      existing: new Map(),
      accountCollectionCount: 0,
      nextCollectionPosition: 3,
      knownStoryIds: known,
    });
    expect(plan.collections).toEqual([
      {
        slug: 'rust',
        name: 'Rust',
        isNew: true,
        position: 3,
        itemsToAdd: [
          { storyId: 'a', position: 0 },
          { storyId: 'b', position: 1 },
        ],
      },
    ]);
    expect(plan.mergedCount).toBe(1);
  });

  it('AC-3.4.5 merges into the account collection with the same slug and adds only missing items after its last one', () => {
    const plan = planCollectionMerge({
      incoming: [
        {
          slug: 'rust',
          name: 'Guest name',
          items: [
            { storyId: 'a', position: 0 },
            { storyId: 'b', position: 1 },
          ],
        },
      ],
      existing: new Map([['rust', { storyIds: new Set(['a']), itemCount: 4 }]]),
      accountCollectionCount: 0,
      nextCollectionPosition: 1,
      knownStoryIds: known,
    });
    expect(plan.collections).toEqual([
      {
        slug: 'rust',
        name: 'Guest name',
        isNew: false,
        position: 0,
        itemsToAdd: [{ storyId: 'b', position: 4 }],
      },
    ]);
  });

  it('reports unknown stories once and skips them', () => {
    const plan = planCollectionMerge({
      incoming: [
        { slug: 'x', name: 'X', items: [{ storyId: 'zz', position: 0 }] },
        { slug: 'y', name: 'Y', items: [{ storyId: 'zz', position: 0 }] },
      ],
      existing: new Map(),
      accountCollectionCount: 0,
      nextCollectionPosition: 0,
      knownStoryIds: known,
    });
    expect(plan.missingStoryIds).toEqual(['zz']);
    expect(plan.collections.map((c) => c.itemsToAdd)).toEqual([[], []]);
    expect(plan.collections.map((c) => c.position)).toEqual([0, 1]);
  });

  it('AC-3.4.5 is idempotent: planning over the merged result adds nothing', () => {
    const plan = planCollectionMerge({
      incoming: [
        {
          slug: 'rust',
          name: 'Rust',
          items: [
            { storyId: 'a', position: 0 },
            { storyId: 'b', position: 1 },
          ],
        },
      ],
      existing: new Map([['rust', { storyIds: new Set(['a', 'b']), itemCount: 2 }]]),
      accountCollectionCount: 0,
      nextCollectionPosition: 1,
      knownStoryIds: known,
    });
    expect(plan.collections[0]?.itemsToAdd).toEqual([]);
    expect(plan.collections[0]?.isNew).toBe(false);
    expect(plan.mergedCount).toBe(1);
  });

  it('creates at most COLLECTIONS_MAX collections in all and counts the rest as skipped', () => {
    const incoming = Array.from({ length: 5 }, (_, index) => ({
      slug: `board-${index}`,
      name: `Board ${index}`,
      items: [],
    }));
    const plan = planCollectionMerge({
      incoming,
      existing: new Map(),
      accountCollectionCount: COLLECTIONS_MAX - 3,
      nextCollectionPosition: COLLECTIONS_MAX - 3,
      knownStoryIds: known,
    });
    expect(plan.collections.map((c) => c.slug)).toEqual(['board-0', 'board-1', 'board-2']);
    expect(plan.skippedCollections).toBe(2);
    expect(plan.mergedCount).toBe(3);
  });

  it('still merges into an existing collection when the account is at the collection limit', () => {
    const plan = planCollectionMerge({
      incoming: [{ slug: 'rust', name: 'Rust', items: [{ storyId: 'a', position: 0 }] }],
      existing: new Map([['rust', { storyIds: new Set<string>(), itemCount: 0 }]]),
      accountCollectionCount: COLLECTIONS_MAX,
      nextCollectionPosition: COLLECTIONS_MAX,
      knownStoryIds: known,
    });
    expect(plan.collections[0]?.itemsToAdd).toHaveLength(1);
    expect(plan.skippedCollections).toBe(0);
  });

  it('caps a collection at COLLECTION_ITEMS_MAX items, counting the existing ones, and counts the overflow', () => {
    const manyIds = Array.from({ length: 5 }, (_, index) => `s${index}`);
    const plan = planCollectionMerge({
      incoming: [
        {
          slug: 'rust',
          name: 'Rust',
          items: manyIds.map((storyId, position) => ({ storyId, position })),
        },
      ],
      existing: new Map([
        ['rust', { storyIds: new Set<string>(), itemCount: COLLECTION_ITEMS_MAX - 3 }],
      ]),
      accountCollectionCount: 1,
      nextCollectionPosition: 1,
      knownStoryIds: new Set(manyIds),
    });
    expect(plan.collections[0]?.itemsToAdd.map((i) => i.position)).toEqual([
      COLLECTION_ITEMS_MAX - 3,
      COLLECTION_ITEMS_MAX - 2,
      COLLECTION_ITEMS_MAX - 1,
    ]);
    expect(plan.skippedItems).toBe(2);
  });
});
