'use client';

import { useMemo } from 'react';
import { sortSavesNewestFirst, type ToggleOutcome } from '@/lib/guest/guestState';
import { guestStorage, useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { saveNotice } from '@/lib/guest/saveNotice';
import { markNoticeShown, shownNotices } from '@/lib/guest/sessionNotices';
import { notify } from './notify';

function announceSave(outcome: ToggleOutcome) {
  const notice = saveNotice({
    outcome,
    memoryOnly: guestStorage.isMemoryOnly(),
    alreadyShown: shownNotices(),
  });
  if (!notice) return;
  markNoticeShown(notice.kind);
  void notify(notice.message);
}

function toggle(storyId: string) {
  announceSave(useGuestStore.getState().toggleSave(storyId, new Date()));
}

function removeUnavailable(storyIds: readonly string[]) {
  useGuestStore.getState().removeSaves(storyIds);
}

/** The one way components read and change saves; guest mode today, account mode behind the same shape later. */
export function useSaves() {
  const saves = useGuestStore((state) => state.saves);
  const isReady = useGuestReady((state) => state.ready);
  const list = useMemo(() => sortSavesNewestFirst(saves), [saves]);
  const ids = useMemo(() => list.map((save) => save.storyId), [list]);
  const savedIds = useMemo(() => new Set(ids), [ids]);

  function isSaved(storyId: string) {
    return savedIds.has(storyId);
  }

  return { ids, list, isReady, isSaved, toggle, removeUnavailable };
}
