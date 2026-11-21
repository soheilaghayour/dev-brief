// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MergeResponse } from '@devbrief/shared';

const mergeSaves = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/endpoints', () => ({ mergeSaves }));
vi.mock('@/lib/toast/notify', () => ({ notify: vi.fn() }));
vi.mock('@/config/features', () => ({ isFeatureEnabled: () => true }));

const { mergeGuestData } = await import('./mergeGuestData');
const { setGuestPreference } = await import('@/lib/guest/guestPreferences');
const { latestGuestData } = await import('@/lib/guest/guestSaves');

const CONFIRMED: MergeResponse = {
  merged: { saves: 0, preferences: 2, collections: 0, notes: 0 },
  skipped: { saves: 0, notes: 0 },
  missingStoryIds: [],
};

beforeEach(async () => {
  mergeSaves.mockReset();
  await setGuestPreference('tag', 'rust', 'follow');
  await setGuestPreference('tag', 'career', 'mute');
});

describe('mergeGuestData preferences', () => {
  it('AC-2.5.3 keeps the device preferences and the pending flag when the merge fails', async () => {
    mergeSaves.mockRejectedValue(new Error('offline'));

    await mergeGuestData(new QueryClient());

    const { prefs, pendingMerge } = await latestGuestData();
    expect(prefs.follow.tags).toEqual(['rust']);
    expect(prefs.mute.tags).toEqual(['career']);
    expect(pendingMerge).toBe(true);
  });

  it('AC-2.5.3 lets go of the sent preferences only once the server confirmed, and keeps one made meanwhile', async () => {
    let duringRequest;
    mergeSaves.mockImplementation(async () => {
      duringRequest = (await latestGuestData()).prefs.follow.tags;
      await setGuestPreference('tag', 'go', 'follow');
      return CONFIRMED;
    });

    await mergeGuestData(new QueryClient());

    expect(duringRequest).toEqual(['rust']);
    const { prefs, pendingMerge } = await latestGuestData();
    expect(prefs.follow.tags).toEqual(['go']);
    expect(prefs.mute.tags).toEqual([]);
    expect(pendingMerge).toBe(false);
  });
});
