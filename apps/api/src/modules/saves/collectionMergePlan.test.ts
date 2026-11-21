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
      nextCollectionPosition: 1,
      knownStoryIds: known,
    });
    expect(plan.collections[0]?.itemsToAdd).toEqual([]);
    expect(plan.collections[0]?.isNew).toBe(false);
    expect(plan.mergedCount).toBe(1);
  });

  it('joins repeated slugs in one request into one collection', () => {
    const plan = planCollectionMerge({
      incoming: [
        { slug: 'rust', name: 'First', items: [{ storyId: 'a', position: 0 }] },
        {
          slug: 'rust',
          name: 'Second',
          items: [
            { storyId: 'a', position: 0 },
            { storyId: 'c', position: 1 },
          ],
        },
      ],
      existing: new Map(),
      nextCollectionPosition: 0,
      knownStoryIds: known,
    });
    expect(plan.collections).toHaveLength(1);
    expect(plan.collections[0]?.name).toBe('First');
    expect(plan.collections[0]?.itemsToAdd.map((i) => i.storyId)).toEqual(['a', 'c']);
    expect(plan.mergedCount).toBe(1);
  });
});
