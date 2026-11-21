import { describe, expect, it } from 'vitest';
import { guestMergeResult, planGuestMerge } from './guestMerge';
import { EMPTY_PREFERENCES, MAX_GUEST_SAVES } from './guestState';
import { migrateGuestData } from './guestParser';

const save = (storyId: string) => ({ storyId, savedAt: '2026-05-01T10:00:00.000Z' });

describe('planGuestMerge', () => {
  it('AC-1.5.5 sends all local saves in one request', () => {
    const saves = [save('a'), save('b')];
    expect(planGuestMerge({ saves, prefs: EMPTY_PREFERENCES, pendingMerge: false })).toEqual({
      action: 'merge',
      request: { version: 1, saves },
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
      request: { version: 1, saves: [save('a')], preferences: prefs },
    });
    expect(planGuestMerge({ saves: [], prefs, pendingMerge: false })).toEqual({
      action: 'merge',
      request: { version: 1, saves: [], preferences: prefs },
    });
  });

  it('leaves preferences out of the request when the device holds none', () => {
    const plan = planGuestMerge({
      saves: [save('a')],
      prefs: EMPTY_PREFERENCES,
      pendingMerge: false,
    });
    expect(plan.action === 'merge' && 'preferences' in plan.request).toBe(false);
  });

  it('never sends more saves than one merge accepts', () => {
    const saves = Array.from({ length: MAX_GUEST_SAVES + 3 }, (_, index) => save(`s${index}`));
    const plan = planGuestMerge({ saves, prefs: EMPTY_PREFERENCES, pendingMerge: false });
    expect(plan.action === 'merge' && plan.request.saves).toHaveLength(MAX_GUEST_SAVES);
  });
});

describe('guestMergeResult', () => {
  const request = { version: 1 as const, saves: [save('a'), save('gone')] };

  it('AC-1.5.5 removes every sent save, including unknown stories, and reports the synced count', () => {
    const result = guestMergeResult(request, {
      merged: { saves: 1, preferences: 0, collections: 0, notes: 0 },
      skipped: { saves: 1, notes: 0 },
      missingStoryIds: ['gone'],
    });
    expect(result.confirmedStoryIds).toEqual(['a', 'gone']);
    expect(result.notice).toBe('1 saved story synced');
  });

  it('AC-1.5.5 words the toast "N saved stories synced"', () => {
    const result = guestMergeResult(request, {
      merged: { saves: 2, preferences: 0, collections: 0, notes: 0 },
      skipped: { saves: 0, notes: 0 },
      missingStoryIds: [],
    });
    expect(result.notice).toBe('2 saved stories synced');
  });

  it('shows no toast when nothing was synced', () => {
    const result = guestMergeResult(request, {
      merged: { saves: 0, preferences: 0, collections: 0, notes: 0 },
      skipped: { saves: 2, notes: 0 },
      missingStoryIds: ['a', 'gone'],
    });
    expect(result.notice).toBeNull();
  });

  it('AC-2.5.3 confirms the sent preferences, and the toast still counts saves only', () => {
    const sent = { ...EMPTY_PREFERENCES, follow: { tags: ['rust' as const], sources: [] } };
    const result = guestMergeResult(
      { ...request, preferences: sent },
      {
        merged: { saves: 1, preferences: 1, collections: 0, notes: 0 },
        skipped: { saves: 1, notes: 0 },
        missingStoryIds: ['gone'],
      },
    );
    expect(result.confirmedPreferences).toEqual(sent);
    expect(result.notice).toBe('1 saved story synced');
    expect(
      guestMergeResult(request, {
        merged: { saves: 1, preferences: 0, collections: 0, notes: 0 },
        skipped: { saves: 1, notes: 0 },
        missingStoryIds: ['gone'],
      }).confirmedPreferences,
    ).toBeUndefined();
  });
});

describe('pendingMerge in stored guest data', () => {
  it('AC-1.5.6 survives a reload, and older v1 data without it loads as false', () => {
    expect(migrateGuestData({ saves: [], pendingMerge: true }, 1)?.pendingMerge).toBe(true);
    expect(migrateGuestData({ saves: [] }, 1)?.pendingMerge).toBe(false);
  });
});
