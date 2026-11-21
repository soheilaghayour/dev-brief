'use client';

import { useMemo } from 'react';
import { purgeGuestSaves, toggleGuestSave } from '@/lib/guest/guestSaves';
import { sortSavesNewestFirst, type ToggleOutcome } from '@/lib/guest/guestState';
import { guestStorage, useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { saveNotice } from '@/lib/guest/saveNotice';
import { markNoticeShown, shownNotices } from '@/lib/guest/sessionNotices';
import { notify } from '@/lib/toast/notify';

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
  // `now` is taken at click time; the write itself waits for the stored saves to load.
  void toggleGuestSave(storyId, new Date()).then(announceSave);
}

/** Saves kept on this device, for a visitor who is not signed in. */
export function useGuestSaves() {
  const saves = useGuestStore((state) => state.saves);
  const isReady = useGuestReady((state) => state.ready);
  const list = useMemo(() => sortSavesNewestFirst(saves), [saves]);
  const ids = useMemo(() => list.map((save) => save.storyId), [list]);
  const savedIds = useMemo(() => new Set(ids), [ids]);

  function isSaved(storyId: string) {
    return savedIds.has(storyId);
  }

  return { ids, list, isReady, isSaved, toggle, removeUnavailable: purgeGuestSaves };
}
