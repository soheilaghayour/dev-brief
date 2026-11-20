import type { MergeRequest, MergeResponse, Preferences, Save } from '@devbrief/shared';
import { MAX_GUEST_SAVES } from './guestState';

function hasPreferences({ follow, mute }: Preferences) {
  return [follow.tags, follow.sources, mute.tags, mute.sources].some((list) => list.length > 0);
}

export type GuestMergePlan =
  { action: 'none' } | { action: 'clearPending' } | { action: 'merge'; request: MergeRequest };

/** Decides what a signed-in load does with the guest data: nothing, clear a stale flag, or send every local save and the preferences in one merge. */
export function planGuestMerge({
  saves,
  prefs,
  pendingMerge,
}: {
  saves: readonly Save[];
  prefs: Preferences;
  pendingMerge: boolean;
}): GuestMergePlan {
  const sendsPrefs = hasPreferences(prefs);
  if (saves.length === 0 && !sendsPrefs) {
    return pendingMerge ? { action: 'clearPending' } : { action: 'none' };
  }
  return {
    action: 'merge',
    request: {
      version: 1,
      saves: saves.slice(0, MAX_GUEST_SAVES),
      ...(sendsPrefs && { preferences: prefs }),
    },
  };
}

export type GuestMergeResult = {
  /** Local saves the server has dealt with: stored in the account, or gone for good. */
  confirmedStoryIds: string[];
  /** True when the request carried the device's preferences, which the account now holds. */
  confirmedPreferences: boolean;
  /** The toast to show, or null when nothing was synced. */
  notice: string | null;
};

/** What a confirmed merge means locally: which saves and whether the preferences leave the store, and what to tell the user (saves only). */
export function guestMergeResult(request: MergeRequest, response: MergeResponse): GuestMergeResult {
  const count = response.merged.saves;
  return {
    confirmedStoryIds: request.saves.map((save) => save.storyId),
    confirmedPreferences: request.preferences !== undefined,
    notice: count === 0 ? null : `${count} saved ${count === 1 ? 'story' : 'stories'} synced`,
  };
}
