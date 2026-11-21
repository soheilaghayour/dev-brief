import { describe, expect, it } from 'vitest';
import { mergeStoredGuest } from './guestParser';
import {
  createGuestData,
  MAX_GUEST_SAVES,
  parseStoredGuest,
  removeSaves,
  serializeGuest,
  sortSavesNewestFirst,
  toggleSave,
  withNote,
  withoutNotes,
} from './guestState';

const DEVICE_ID = '3f2b8f0e-6a52-4c53-9a39-6b1c2f1e7a10';
const A = 'cstoryaaaaaaaaaaaaaaaaaa';
const NOW = new Date('2026-05-01T10:00:00.000Z');

describe('toggleSave', () => {
  it('AC-1.4.2 adds a story with its savedAt', () => {
    expect(toggleSave([], 'a', NOW)).toEqual({
      outcome: 'added',
      saves: [{ storyId: 'a', savedAt: '2026-05-01T10:00:00.000Z' }],
    });
  });

  it('removes a story that is saved already, so a story is never saved twice', () => {
    const saves = [{ storyId: 'a', savedAt: '2026-04-01T00:00:00.000Z' }];
    expect(toggleSave(saves, 'a', NOW)).toEqual({ outcome: 'removed', saves: [] });
  });

  it('refuses a new save at the cap and keeps the old ones', () => {
    const saves = Array.from({ length: MAX_GUEST_SAVES }, (_, index) => ({
      storyId: `s${index}`,
      savedAt: '2026-04-01T00:00:00.000Z',
    }));
    const result = toggleSave(saves, 'new', NOW);
    expect(result.outcome).toBe('full');
    expect(result.saves).toHaveLength(MAX_GUEST_SAVES);
    expect(toggleSave(saves, 's0', NOW).outcome).toBe('removed');
  });
});

describe('removeSaves and sortSavesNewestFirst', () => {
  const saves = [
    { storyId: 'a', savedAt: '2026-04-01T00:00:00.000Z' },
    { storyId: 'b', savedAt: '2026-04-03T00:00:00.000Z' },
    { storyId: 'c', savedAt: '2026-04-02T00:00:00.000Z' },
  ];

  it('drops the given ids', () => {
    expect(removeSaves(saves, ['a', 'zzz']).map((save) => save.storyId)).toEqual(['b', 'c']);
  });

  it('AC-1.4.3 orders newest-saved first without touching the input', () => {
    expect(sortSavesNewestFirst(saves).map((save) => save.storyId)).toEqual(['b', 'c', 'a']);
    expect(saves[0]?.storyId).toBe('a');
  });
});

describe('stored text', () => {
  it('AC-1.4.2 serializes the flat shape with the version', () => {
    const data = createGuestData(DEVICE_ID);
    expect(JSON.parse(serializeGuest(data))).toEqual({
      version: 1,
      deviceId: DEVICE_ID,
      saves: [],
      prefs: { follow: { tags: [], sources: [] }, mute: { tags: [], sources: [] } },
      collections: [],
      notes: {},
      hintDismissed: false,
      pendingMerge: false,
    });
  });

  it('round-trips through parse and merge', () => {
    const data = {
      ...createGuestData(DEVICE_ID),
      saves: [{ storyId: A, savedAt: '2026-04-01T00:00:00.000Z' }],
    };
    const stored = parseStoredGuest(serializeGuest(data));
    expect(stored?.version).toBe(1);
    expect(
      mergeStoredGuest(stored?.state, createGuestData('11111111-1111-4111-8111-111111111111')),
    ).toEqual(data);
  });

  it('treats invalid JSON as nothing stored and a missing version as 0', () => {
    expect(parseStoredGuest('{oops')).toBeNull();
    expect(parseStoredGuest(null)).toBeNull();
    expect(parseStoredGuest('{"saves":[]}')?.version).toBe(0);
  });

  it('keeps the current state when the stored value is garbage', () => {
    const current = createGuestData(DEVICE_ID);
    expect(mergeStoredGuest('garbage', current)).toEqual(current);
  });
});

describe('notes', () => {
  const saves = [{ storyId: A, savedAt: '2026-04-01T00:00:00.000Z' }];

  it('AC-3.4.2 stores the note with its time for a saved story', () => {
    expect(withNote({}, saves, A, 'hello', NOW)).toEqual({
      [A]: { note: 'hello', updatedAt: '2026-05-01T10:00:00.000Z' },
    });
  });

  it('AC-3.4.2 clearing the note removes it, and a story that is not saved holds none', () => {
    const notes = withNote({}, saves, A, 'hello', NOW);
    expect(withNote(notes, saves, A, null, NOW)).toEqual({});
    expect(withNote({}, saves, 'other', 'hello', NOW)).toEqual({});
  });

  it('withoutNotes keeps the notes of the other stories', () => {
    const at = NOW.toISOString();
    const notes = { a: { note: 'x', updatedAt: at }, b: { note: 'y', updatedAt: at } };
    expect(Object.keys(withoutNotes(notes, ['a']))).toEqual(['b']);
  });
});
