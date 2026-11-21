import { SaveNotePatchSchema } from '@devbrief/shared';
import { useGuestStore } from './guestStore';
import { loadLatestGuestStore as loadLatest } from './hydrateGuestStore';

export type SetNoteOutcome = 'saved' | 'removed' | 'too-long' | 'not-saved';

/** Writes the note of a saved story under the server's rules: at most 20,000 characters, and "" counts as no note. */
export async function setGuestNote(
  storyId: string,
  note: string | null,
  now: Date,
): Promise<SetNoteOutcome> {
  const patch = SaveNotePatchSchema.safeParse({ note });
  if (!patch.success) return 'too-long';
  await loadLatest();
  const state = useGuestStore.getState();
  if (!state.saves.some((save) => save.storyId === storyId)) return 'not-saved';
  const stored = patch.data.note === '' ? null : patch.data.note;
  state.setNote(storyId, stored, now);
  return stored === null ? 'removed' : 'saved';
}
