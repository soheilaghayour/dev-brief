import type { MergeRequest, MergeResponse, Save } from '@devbrief/shared';
import { MAX_GUEST_SAVES } from './guestState';

export type GuestMergePlan =
  { action: 'none' } | { action: 'clearPending' } | { action: 'merge'; request: MergeRequest };

/** Decides what a signed-in load does with the guest data: nothing, clear a stale flag, or send every local save in one merge. */
export function planGuestMerge({
  saves,
  pendingMerge,
}: {
  saves: readonly Save[];
  pendingMerge: boolean;
}): GuestMergePlan {
  if (saves.length === 0) return pendingMerge ? { action: 'clearPending' } : { action: 'none' };
  return { action: 'merge', request: { version: 1, saves: saves.slice(0, MAX_GUEST_SAVES) } };
}

export type GuestMergeResult = {
  /** Local saves the server has dealt with: stored in the account, or gone for good. */
  confirmedStoryIds: string[];
  /** The toast to show, or null when nothing was synced. */
  notice: string | null;
};

/** What a confirmed merge means locally: which saves leave the store, and what to tell the user. */
export function guestMergeResult(request: MergeRequest, response: MergeResponse): GuestMergeResult {
  const count = response.merged.saves;
  return {
    confirmedStoryIds: request.saves.map((save) => save.storyId),
    notice: count === 0 ? null : `${count} saved ${count === 1 ? 'story' : 'stories'} synced`,
  };
}
