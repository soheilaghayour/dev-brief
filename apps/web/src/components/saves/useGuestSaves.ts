'use client';

import { useMemo } from 'react';
import { isFeatureEnabled } from '@/config/features';
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
  // Unsaving a story with a note asks first (AC-3.4.1); the dialog calls `confirmUnsave` when the reader agrees.
  const { saves, notes } = useGuestStore.getState();
  const isSaved = saves.some((save) => save.storyId === storyId);
  if (isSaved && notes[storyId] && isFeatureEnabled('collections')) {
    // The store loads with the confirmation chunk, which the layout fetches after first load.
    void import('@/components/notes/unsaveRequest').then((module) => module.requestUnsave(storyId));
    return;
  }
  confirmUnsave(storyId);
}

/** Toggles the save without asking, which is what the unsave confirmation runs once the reader agrees. */
export function confirmUnsave(storyId: string) {
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
  const notes = useGuestStore((state) => state.notes);
  const savedAts = useMemo(() => new Map(list.map((save) => [save.storyId, save.savedAt])), [list]);

  function isSaved(storyId: string) {
    return savedIds.has(storyId);
  }

  function note(storyId: string) {
    return notes[storyId]?.note ?? null;
  }

  function savedAt(storyId: string) {
    return savedAts.get(storyId) ?? null;
  }

  // The writer (and Zod with it) loads on the first write.
  async function setNote(storyId: string, markdown: string | null) {
    const { setGuestNote } = await import('@/lib/guest/guestNotes');
    return setGuestNote(storyId, markdown, new Date());
  }

  return {
    ids,
    list,
    isReady,
    isSaved,
    toggle,
    note,
    setNote,
    savedAt,
    removeUnavailable: purgeGuestSaves,
  };
}
