import { describe, expect, it } from 'vitest';
import { planSaveMerge } from './mergePlan.js';

const known = new Set(['a', 'b', 'c']);
const EARLY = '2026-01-01T00:00:00.000Z';
const LATE = '2026-02-01T00:00:00.000Z';

describe('planSaveMerge', () => {
  it('AC-1.5.5 creates saves the account does not have', () => {
    const plan = planSaveMerge({
      incoming: [{ storyId: 'a', savedAt: EARLY }],
      existing: new Map(),
      knownStoryIds: known,
    });
    expect(plan).toEqual({
      toCreate: [{ storyId: 'a', savedAt: EARLY }],
      toMoveEarlier: [],
      missingStoryIds: [],
      mergedCount: 1,
    });
  });

  it('AC-1.5.5 keeps the earliest savedAt: a later local date changes nothing, an earlier one wins', () => {
    const plan = planSaveMerge({
      incoming: [
        { storyId: 'a', savedAt: LATE },
        { storyId: 'b', savedAt: EARLY },
      ],
      existing: new Map([
        ['a', EARLY],
        ['b', LATE],
      ]),
      knownStoryIds: known,
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toMoveEarlier).toEqual([{ storyId: 'b', savedAt: EARLY }]);
    expect(plan.mergedCount).toBe(2);
  });

  it('AC-1.5.5 is idempotent: planning again over the result writes nothing', () => {
    const plan = planSaveMerge({
      incoming: [{ storyId: 'a', savedAt: EARLY }],
      existing: new Map([['a', EARLY]]),
      knownStoryIds: known,
    });
    expect(plan.toCreate).toEqual([]);
    expect(plan.toMoveEarlier).toEqual([]);
    expect(plan.mergedCount).toBe(1);
  });

  it('collapses a story repeated in one request to its earliest date', () => {
    const plan = planSaveMerge({
      incoming: [
        { storyId: 'a', savedAt: LATE },
        { storyId: 'a', savedAt: EARLY },
      ],
      existing: new Map(),
      knownStoryIds: known,
    });
    expect(plan.toCreate).toEqual([{ storyId: 'a', savedAt: EARLY }]);
    expect(plan.mergedCount).toBe(1);
  });

  it('reports unknown stories as missing and does not write them', () => {
    const plan = planSaveMerge({
      incoming: [
        { storyId: 'gone', savedAt: EARLY },
        { storyId: 'a', savedAt: EARLY },
      ],
      existing: new Map(),
      knownStoryIds: known,
    });
    expect(plan.missingStoryIds).toEqual(['gone']);
    expect(plan.toCreate).toEqual([{ storyId: 'a', savedAt: EARLY }]);
    expect(plan.mergedCount).toBe(1);
  });
});
