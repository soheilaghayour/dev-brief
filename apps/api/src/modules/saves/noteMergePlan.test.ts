import { NOTE_MAX_LENGTH } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { planNoteMerge } from './noteMergePlan.js';

const known = new Set(['a', 'b']);
const AT = '2026-03-01T00:00:00.000Z';
const LATER = '2026-03-02T00:00:00.000Z';

const plan = (
  incoming: { storyId: string; note: string; updatedAt?: string }[],
  existing: [string, string | null][] = [],
) =>
  planNoteMerge({
    incoming: incoming.map((note) => ({ updatedAt: AT, ...note })),
    existing: new Map(existing),
    knownStoryIds: known,
  });

describe('planNoteMerge', () => {
  it('AC-3.4.5 sets the local note when the account has none, with the local date', () => {
    const result = plan([{ storyId: 'a', note: 'local' }], [['a', null]]);
    expect(result.toSet).toEqual([{ storyId: 'a', note: 'local', noteUpdatedAt: AT }]);
    expect(result.mergedCount).toBe(1);
  });

  it('AC-3.4.5 changes nothing for an identical note', () => {
    const result = plan([{ storyId: 'a', note: 'same' }], [['a', 'same']]);
    expect(result.toSet).toEqual([]);
    expect(result.mergedCount).toBe(1);
  });

  it('AC-3.4.5 makes a conflict server + --- + local', () => {
    const result = plan([{ storyId: 'a', note: 'local' }], [['a', 'server']]);
    expect(result.toSet).toEqual([
      { storyId: 'a', note: 'server\n\n---\n\nlocal', noteUpdatedAt: AT },
    ]);
  });

  it('AC-3.4.5 appends nothing when the server note already contains the local note', () => {
    const result = plan([{ storyId: 'a', note: 'local' }], [['a', 'server\n\n---\n\nlocal']]);
    expect(result.toSet).toEqual([]);
    expect(result.mergedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
  });

  it('AC-3.4.5 skips and counts a combined note over the limit, keeping the server note', () => {
    const server = 'x'.repeat(NOTE_MAX_LENGTH - 5);
    const result = plan([{ storyId: 'a', note: 'y'.repeat(10) }], [['a', server]]);
    expect(result.toSet).toEqual([]);
    expect(result.skippedCount).toBe(1);
    expect(result.mergedCount).toBe(0);
  });

  it('accepts a combined note of exactly the limit', () => {
    const local = 'y'.repeat(10);
    const server = 'x'.repeat(NOTE_MAX_LENGTH - 10 - '\n\n---\n\n'.length);
    const result = plan([{ storyId: 'a', note: local }], [['a', server]]);
    expect(result.toSet[0]?.note).toHaveLength(NOTE_MAX_LENGTH);
    expect(result.skippedCount).toBe(0);
  });

  it('reports unknown stories and ignores an empty local note', () => {
    const result = plan([
      { storyId: 'zz', note: 'n' },
      { storyId: 'b', note: '' },
    ]);
    expect(result.missingStoryIds).toEqual(['zz']);
    expect(result.toSet).toEqual([]);
    expect(result.mergedCount).toBe(1);
  });

  it('keeps the newest of repeated notes for one story', () => {
    const result = plan([
      { storyId: 'a', note: 'old', updatedAt: AT },
      { storyId: 'a', note: 'new', updatedAt: LATER },
    ]);
    expect(result.toSet).toEqual([{ storyId: 'a', note: 'new', noteUpdatedAt: LATER }]);
    expect(result.mergedCount).toBe(1);
  });
});
