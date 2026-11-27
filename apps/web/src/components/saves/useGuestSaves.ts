'use client';

import { useMemo } from 'react';
import { isFeatureEnabled } from '@/config/features';
import {
  latestGuestData,
  purgeGuestSaves,
  toggleGuestSave,
  unsaveGuestSave,
} from '@/lib/guest/guestSaves';
import { sortSavesNewestFirst, type ToggleOutcome } from '@/lib/guest/guestState';
import { guestStorage, useGuestStore } from '@/lib/guest/guestStore';
import { useGuestReady } from '@/lib/guest/hydrateGuestStore';
import { saveNotice } from '@/lib/guest/saveNotice';
import { markNoticeShown, shownNotices } from '@/lib/guest/sessionNotices';
import { notify } from '@/lib/toast/notify';
import { flushPendingNote } from './pendingNote';
import { requestUnsave, type ToggleSaveOptions } from './unsaveRequest';

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

// Everything waits for the stored saves, so whether a note exists is decided on what is stored now.
async function toggle(storyId: string, { title }: ToggleSaveOptions) {
  // `now` is taken at click time.
  const now = new Date();
  // What the reader just typed in the open editor counts as a note.
  await flushPendingNote();
  const { saves, notes } = await latestGuestData();
  const isSaved = saves.some((save) => save.storyId === storyId);
  if (isSaved && notes[storyId] && isFeatureEnabled('collections')) {
    requestUnsave({ storyId, title });
    return;
  }
  announceSave(await toggleGuestSave(storyId, now));
}

async function remove(storyId: string) {
  await unsaveGuestSave(storyId, new Date());
}

type NoteWriter = typeof import('@/lib/guest/guestNotes');
let noteWriter: NoteWriter | undefined;

// The writer (and Zod with it) loads when an editor opens, so a write as the page closes needn't wait for it.
function prepareNoteWrites() {
  void import('@/lib/guest/guestNotes').then((module) => {
    noteWriter = module;
  });
}

async function setNote(storyId: string, markdown: string | null) {
  const writer = noteWriter ?? (await import('@/lib/guest/guestNotes'));
  return writer.setGuestNote(storyId, markdown, new Date());
}

// Synchronous, for a page that is closing; does nothing when the writer hasn't loaded yet.
function setNoteNow(storyId: string, markdown: string | null) {
  noteWriter?.setGuestNoteNow(storyId, markdown, new Date());
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

  return {
    ids,
    list,
    isReady,
    isSaved,
    toggle,
    remove,
    note,
    setNote,
    setNoteNow,
    prepareNoteWrites,
    savedAt,
    removeUnavailable: purgeGuestSaves,
  };
}
