import { describe, expect, it } from 'vitest';
import { guestMergeResult, planGuestMerge } from './guestMerge';
import { MAX_GUEST_SAVES } from './guestState';
import { migrateGuestData } from './guestParser';

const save = (storyId: string) => ({ storyId, savedAt: '2026-05-01T10:00:00.000Z' });

describe('planGuestMerge', () => {
  it('AC-1.5.5 sends all local saves in one request', () => {
    const saves = [save('a'), save('b')];
    expect(planGuestMerge({ saves, pendingMerge: false })).toEqual({
      action: 'merge',
      request: { version: 1, saves },
    });
  });

  it('AC-1.5.6 retries a pending merge that still has local saves', () => {
    expect(planGuestMerge({ saves: [save('a')], pendingMerge: true }).action).toBe('merge');
  });

  it('does nothing without saves, and only clears a stale pending flag', () => {
    expect(planGuestMerge({ saves: [], pendingMerge: false })).toEqual({ action: 'none' });
    expect(planGuestMerge({ saves: [], pendingMerge: true })).toEqual({ action: 'clearPending' });
  });

  it('never sends more saves than one merge accepts', () => {
    const saves = Array.from({ length: MAX_GUEST_SAVES + 3 }, (_, index) => save(`s${index}`));
    const plan = planGuestMerge({ saves, pendingMerge: false });
    expect(plan.action === 'merge' && plan.request.saves).toHaveLength(MAX_GUEST_SAVES);
  });
});

describe('guestMergeResult', () => {
  const request = { version: 1 as const, saves: [save('a'), save('gone')] };

  it('AC-1.5.5 removes every sent save, including unknown stories, and reports the synced count', () => {
    const result = guestMergeResult(request, {
      merged: { saves: 1 },
      skipped: { saves: 1 },
      missingStoryIds: ['gone'],
    });
    expect(result.confirmedStoryIds).toEqual(['a', 'gone']);
    expect(result.notice).toBe('1 saved story synced');
  });

  it('AC-1.5.5 words the toast "N saved stories synced"', () => {
    const result = guestMergeResult(request, {
      merged: { saves: 2 },
      skipped: { saves: 0 },
      missingStoryIds: [],
    });
    expect(result.notice).toBe('2 saved stories synced');
  });

  it('shows no toast when nothing was synced', () => {
    const result = guestMergeResult(request, {
      merged: { saves: 0 },
      skipped: { saves: 2 },
      missingStoryIds: ['a', 'gone'],
    });
    expect(result.notice).toBeNull();
  });
});

describe('pendingMerge in stored guest data', () => {
  it('AC-1.5.6 survives a reload, and older v1 data without it loads as false', () => {
    expect(migrateGuestData({ saves: [], pendingMerge: true }, 1)?.pendingMerge).toBe(true);
    expect(migrateGuestData({ saves: [] }, 1)?.pendingMerge).toBe(false);
  });
});
