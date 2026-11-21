import { NOTE_MAX_LENGTH } from '@devbrief/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { setGuestNote } from './guestNotes';
import { useGuestStore } from './guestStore';
import { hydrateGuestStore } from './hydrateGuestStore';

const A = 'cstoryaaaaaaaaaaaaaaaaaa';
const NOW = new Date('2026-05-01T10:00:00.000Z');

beforeEach(async () => {
  await hydrateGuestStore();
  useGuestStore.setState({ saves: [{ storyId: A, savedAt: NOW.toISOString() }], notes: {} });
});

describe('setGuestNote', () => {
  it('AC-3.4.2 stores a note of a saved story', async () => {
    expect(await setGuestNote(A, 'hello', NOW)).toBe('saved');
    expect(useGuestStore.getState().notes[A]).toEqual({
      note: 'hello',
      updatedAt: NOW.toISOString(),
    });
  });

  it('AC-3.4.2 accepts exactly 20,000 characters and refuses one more, keeping the old note', async () => {
    expect(await setGuestNote(A, 'x'.repeat(NOTE_MAX_LENGTH), NOW)).toBe('saved');
    expect(await setGuestNote(A, 'y'.repeat(NOTE_MAX_LENGTH + 1), NOW)).toBe('too-long');
    expect(useGuestStore.getState().notes[A]?.note).toBe('x'.repeat(NOTE_MAX_LENGTH));
  });

  it('AC-3.4.2 an empty note counts as no note', async () => {
    await setGuestNote(A, 'hello', NOW);
    expect(await setGuestNote(A, '', NOW)).toBe('removed');
    expect(useGuestStore.getState().notes).toEqual({});
  });

  it('refuses a note on a story that is not saved', async () => {
    expect(await setGuestNote('cstorybbbbbbbbbbbbbbbbbb', 'hello', NOW)).toBe('not-saved');
    expect(useGuestStore.getState().notes).toEqual({});
  });
});
