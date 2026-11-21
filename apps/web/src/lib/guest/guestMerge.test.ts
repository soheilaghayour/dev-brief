import { describe, expect, it } from 'vitest';
import type { MergeRequest, MergeResponse } from '@devbrief/shared';
import {
  guestMergeRelease,
  MERGE_BODY_BUDGET_BYTES,
  mergeNotices,
  planGuestMerge,
} from './guestMerge';
import { EMPTY_PREFERENCES, MAX_GUEST_SAVES } from './guestState';
import { migrateGuestData } from './guestParser';

const save = (storyId: string) => ({ storyId, savedAt: '2026-05-01T10:00:00.000Z' });

describe('planGuestMerge', () => {
  it('AC-1.5.5 sends all local saves in one request', () => {
    const saves = [save('a'), save('b')];
    expect(planGuestMerge({ saves, prefs: EMPTY_PREFERENCES, pendingMerge: false })).toEqual({
      action: 'merge',
      requests: [{ version: 1, saves }],
    });
  });

  it('merges any remaining local saves, pending flag or not', () => {
    expect(
      planGuestMerge({ saves: [save('a')], prefs: EMPTY_PREFERENCES, pendingMerge: true }).action,
    ).toBe('merge');
    expect(
      planGuestMerge({ saves: [save('a')], prefs: EMPTY_PREFERENCES, pendingMerge: false }).action,
    ).toBe('merge');
  });

  it('does nothing without saves, and only clears a stale pending flag', () => {
    expect(planGuestMerge({ saves: [], prefs: EMPTY_PREFERENCES, pendingMerge: false })).toEqual({
      action: 'none',
    });
    expect(planGuestMerge({ saves: [], prefs: EMPTY_PREFERENCES, pendingMerge: true })).toEqual({
      action: 'clearPending',
    });
  });

  const prefs = {
    follow: { tags: ['rust' as const], sources: [] },
    mute: { tags: [], sources: ['hn'] },
  };

  it('AC-2.5.3 sends the device preferences with the saves, and alone when there are no saves', () => {
    expect(planGuestMerge({ saves: [save('a')], prefs, pendingMerge: false })).toEqual({
      action: 'merge',
      requests: [{ version: 1, saves: [save('a')], preferences: prefs }],
    });
    expect(planGuestMerge({ saves: [], prefs, pendingMerge: false })).toEqual({
      action: 'merge',
      requests: [{ version: 1, saves: [], preferences: prefs }],
    });
  });

  it('leaves preferences out of the request when the device holds none', () => {
    const plan = planGuestMerge({
      saves: [save('a')],
      prefs: EMPTY_PREFERENCES,
      pendingMerge: false,
    });
    expect(plan.action === 'merge' && 'preferences' in (plan.requests[0] ?? {})).toBe(false);
  });

  it('never sends more saves than one merge accepts', () => {
    const saves = Array.from({ length: MAX_GUEST_SAVES + 3 }, (_, index) => save(`s${index}`));
    const plan = planGuestMerge({ saves, prefs: EMPTY_PREFERENCES, pendingMerge: false });
    expect(plan.action === 'merge' && plan.requests[0]?.saves).toHaveLength(MAX_GUEST_SAVES);
  });
});

const response = (overrides: {
  merged?: Partial<MergeResponse['merged']>;
  skipped?: Partial<MergeResponse['skipped']>;
}): MergeResponse => ({
  merged: { saves: 0, preferences: 0, collections: 0, notes: 0, ...overrides.merged },
  skipped: { saves: 0, notes: 0, collections: 0, items: 0, ...overrides.skipped },
  missingStoryIds: [],
});

const board = (slug: string, storyIds: string[]) => ({
  id: `id-${slug}`,
  slug,
  name: slug,
  description: null,
  position: 0,
  items: storyIds.map((storyId, position) => ({
    storyId,
    position,
    addedAt: '2026-05-01T10:00:00.000Z',
  })),
});
const guestNote = (note: string) => ({ note, updatedAt: '2026-05-02T10:00:00.000Z' });

describe('planGuestMerge collections and notes', () => {
  it('AC-3.4.5 sends the boards by slug with their items in order, and the notes, in the first request', () => {
    const plan = planGuestMerge({
      saves: [save('a')],
      prefs: EMPTY_PREFERENCES,
      collections: [board('reading', ['b', 'a'])],
      notes: { a: guestNote('hello') },
      pendingMerge: false,
    });
    expect(plan).toEqual({
      action: 'merge',
      requests: [
        {
          version: 1,
          saves: [save('a')],
          collections: [
            {
              slug: 'reading',
              name: 'reading',
              items: [
                { storyId: 'b', position: 0 },
                { storyId: 'a', position: 1 },
              ],
            },
          ],
          notes: [{ storyId: 'a', note: 'hello', updatedAt: '2026-05-02T10:00:00.000Z' }],
        },
      ],
    });
  });

  it('AC-3.4.5 still sends a note whose story is no longer in the saves', () => {
    const plan = planGuestMerge({
      saves: [],
      prefs: EMPTY_PREFERENCES,
      notes: { gone: guestNote('kept') },
      pendingMerge: true,
    });
    expect(plan.action === 'merge' && plan.requests[0]?.notes?.[0]?.storyId).toBe('gone');
  });

  it('AC-3.4.5 merges when only collections are left', () => {
    const plan = planGuestMerge({
      saves: [],
      prefs: EMPTY_PREFERENCES,
      collections: [board('reading', [])],
      pendingMerge: false,
    });
    expect(plan.action).toBe('merge');
  });

  it('AC-3.4.5 keeps every request under 512 KB with 30 notes of 20,000 characters, saves and boards in the first', () => {
    const notes = Object.fromEntries(
      Array.from({ length: 30 }, (_, index) => [`story${index}`, guestNote('x'.repeat(20_000))]),
    );
    const plan = planGuestMerge({
      saves: [save('a')],
      prefs: EMPTY_PREFERENCES,
      collections: [board('reading', ['a'])],
      notes,
      pendingMerge: false,
    });
    if (plan.action !== 'merge') throw new Error('expected a merge');
    // 30 x 20 KB is 600 KB: one request would be refused by the body limit.
    expect(plan.requests.length).toBeGreaterThan(1);
    for (const request of plan.requests) {
      expect(new TextEncoder().encode(JSON.stringify(request)).length).toBeLessThan(512 * 1024);
      expect(new TextEncoder().encode(JSON.stringify(request)).length).toBeLessThanOrEqual(
        MERGE_BODY_BUDGET_BYTES + 1000,
      );
    }
    expect(plan.requests[0]?.saves).toHaveLength(1);
    expect(plan.requests[0]?.collections).toHaveLength(1);
    for (const request of plan.requests.slice(1)) {
      expect(request.saves).toEqual([]);
      expect(request.collections).toBeUndefined();
    }
    const sent = plan.requests.flatMap((request) => request.notes ?? []);
    expect(sent).toHaveLength(30);
    expect(new Set(sent.map((note) => note.storyId)).size).toBe(30);
  });

  it('AC-3.4.5 counts multi-byte text by bytes, not characters', () => {
    const notes = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`story${index}`, guestNote('語'.repeat(20_000))]),
    );
    const plan = planGuestMerge({
      saves: [],
      prefs: EMPTY_PREFERENCES,
      notes,
      pendingMerge: false,
    });
    if (plan.action !== 'merge') throw new Error('expected a merge');
    // JSON keeps 語 as 3 UTF-8 bytes, so 10 notes are 600 KB.
    expect(plan.requests.length).toBeGreaterThan(1);
    for (const request of plan.requests) {
      expect(new TextEncoder().encode(JSON.stringify(request)).length).toBeLessThan(512 * 1024);
    }
  });

  it('sends at most 500 notes per request', () => {
    const notes = Object.fromEntries(
      Array.from({ length: 501 }, (_, index) => [`story${index}`, guestNote('n')]),
    );
    const plan = planGuestMerge({
      saves: [],
      prefs: EMPTY_PREFERENCES,
      notes,
      pendingMerge: false,
    });
    expect(
      plan.action === 'merge' && plan.requests.map((request) => request.notes?.length),
    ).toEqual([500, 1]);
  });
});

describe('guestMergeRelease', () => {
  const request: MergeRequest = {
    version: 1,
    saves: [save('a'), save('gone')],
    collections: [{ slug: 'reading', name: 'Reading', items: [] }],
    notes: [{ storyId: 'a', note: 'n', updatedAt: '2026-05-02T10:00:00.000Z' }],
  };

  it('AC-1.5.5 releases every sent save, unknown stories included, with the boards and notes', () => {
    const release = guestMergeRelease(request);
    expect(release.storyIds).toEqual(['a', 'gone']);
    expect(release.collections).toEqual(request.collections);
    expect(release.notes).toEqual(request.notes);
    expect(release.preferences).toBeUndefined();
  });

  it('AC-2.5.3 releases the sent preferences', () => {
    const sent = { ...EMPTY_PREFERENCES, follow: { tags: ['rust' as const], sources: [] } };
    expect(guestMergeRelease({ ...request, preferences: sent }).preferences).toEqual(sent);
  });
});

describe('mergeNotices', () => {
  it('AC-1.5.5 words the toast "N saved stories synced", and "1 saved story" for one', () => {
    expect(mergeNotices([response({ merged: { saves: 2 } })])).toEqual(['2 saved stories synced']);
    expect(mergeNotices([response({ merged: { saves: 1 } })])).toEqual(['1 saved story synced']);
  });

  it('AC-3.4.5 counts saves, collections and notes, leaving out the zero parts', () => {
    expect(mergeNotices([response({ merged: { saves: 3, collections: 2, notes: 1 } })])).toEqual([
      '3 saved stories, 2 collections and 1 note synced',
    ]);
    expect(mergeNotices([response({ merged: { collections: 1, notes: 2 } })])).toEqual([
      '1 collection and 2 notes synced',
    ]);
    expect(mergeNotices([response({ merged: { notes: 1 } })])).toEqual(['1 note synced']);
  });

  it('adds the counts of several requests', () => {
    expect(
      mergeNotices([
        response({ merged: { saves: 1, collections: 1, notes: 2 } }),
        response({ merged: { notes: 3 } }),
      ]),
    ).toEqual(['1 saved story, 1 collection and 5 notes synced']);
  });

  it('shows no toast when nothing was synced, and never words unknown stories as skipped saves', () => {
    expect(mergeNotices([response({ skipped: { saves: 4 } })])).toEqual([]);
  });

  it('AC-3.4.5 tells about a note that is over the limit together with the account note', () => {
    expect(mergeNotices([response({ skipped: { notes: 1 } })])).toEqual([
      "1 note couldn't be merged: together with the account's note it is over 20,000 characters",
    ]);
    expect(mergeNotices([response({ skipped: { notes: 2 } })])[0]).toContain('2 notes');
  });

  it('reports collections and items past the limits', () => {
    expect(
      mergeNotices([
        response({ merged: { collections: 50 }, skipped: { collections: 2, items: 1 } }),
      ]),
    ).toEqual([
      '50 collections synced',
      "2 collections couldn't be merged: an account holds at most 50 collections",
      "1 story couldn't be added to a collection: a collection holds at most 500 stories",
    ]);
  });
});

describe('pendingMerge in stored guest data', () => {
  it('AC-1.5.6 survives a reload, and older v1 data without it loads as false', () => {
    expect(migrateGuestData({ saves: [], pendingMerge: true }, 1)?.pendingMerge).toBe(true);
    expect(migrateGuestData({ saves: [] }, 1)?.pendingMerge).toBe(false);
  });
});
