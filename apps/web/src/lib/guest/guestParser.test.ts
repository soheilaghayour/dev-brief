import { COLLECTION_ITEMS_MAX, COLLECTIONS_MAX, NOTE_MAX_LENGTH } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { hasUnreadableCollectionsOrNotes, migrateGuestData } from './guestParser';
import { createGuestData, EMPTY_PREFERENCES, MAX_GUEST_SAVES } from './guestState';

const DEVICE_ID = '3f2b8f0e-6a52-4c53-9a39-6b1c2f1e7a10';
const A = 'cstoryaaaaaaaaaaaaaaaaaa';
const B = 'cstorybbbbbbbbbbbbbbbbbb';

describe('migrateGuestData', () => {
  it('keeps a valid current value as it is', () => {
    const data = { ...createGuestData(DEVICE_ID), hintDismissed: true };
    expect(migrateGuestData(data, 1)).toEqual(data);
  });

  it('migrates an older value, keeping what is usable', () => {
    const older = {
      deviceId: 'not-a-uuid',
      saves: [
        { storyId: A, savedAt: '2026-04-01T00:00:00.000Z' },
        { storyId: A, savedAt: '2026-04-02T00:00:00.000Z' },
        { storyId: 7, savedAt: 'yesterday' },
        'junk',
      ],
      hintDismissed: 'yes',
    };
    expect(migrateGuestData(older, 0)).toEqual({
      saves: [{ storyId: A, savedAt: '2026-04-01T00:00:00.000Z' }],
      prefs: EMPTY_PREFERENCES,
      hintDismissed: false,
      collections: [],
      notes: {},
      pendingMerge: false,
    });
  });

  it('AC-2.5.1 keeps valid stored preferences', () => {
    const prefs = {
      follow: { tags: ['rust'], sources: ['hn'] },
      mute: { tags: ['career'], sources: [] },
    };
    expect(migrateGuestData({ prefs }, 1)?.prefs).toEqual(prefs);
  });

  it.each([
    ['missing (v1 data from before preferences)', undefined],
    ['not an object', 'react'],
    [
      'an unknown tag',
      { follow: { tags: ['cobol'], sources: [] }, mute: { tags: [], sources: [] } },
    ],
    [
      'a value both followed and muted',
      { follow: { tags: ['rust'], sources: [] }, mute: { tags: ['rust'], sources: [] } },
    ],
    [
      'a list over the cap',
      {
        follow: { tags: [], sources: Array.from({ length: 21 }, (_, index) => `blog-${index}`) },
        mute: { tags: [], sources: [] },
      },
    ],
  ])('AC-2.5.1 reads preferences that are %s as empty', (_case, prefs) => {
    expect(migrateGuestData({ saves: [], prefs }, 1)?.prefs).toEqual(EMPTY_PREFERENCES);
  });

  it.each([null, 'text', 42, [], undefined])('rejects the garbage value %j', (garbage) => {
    expect(migrateGuestData(garbage, 1)).toBeNull();
  });

  it('rejects data from a newer version instead of guessing', () => {
    expect(migrateGuestData({ deviceId: DEVICE_ID, saves: [] }, 2)).toBeNull();
  });

  it('caps an oversized list', () => {
    const saves = Array.from({ length: MAX_GUEST_SAVES + 20 }, (_, index) => ({
      storyId: `c${String(index).padStart(24, '0')}`,
      savedAt: '2026-04-01T00:00:00.000Z',
    }));
    expect(migrateGuestData({ saves }, 1)?.saves).toHaveLength(MAX_GUEST_SAVES);
  });
});

describe('migrateGuestData collections', () => {
  const item = (storyId: string, position: number) => ({
    storyId,
    position,
    addedAt: '2026-05-01T10:00:00.000Z',
  });
  const stored = (slug: string, position: number, items = [item(A, 0)]) => ({
    id: `id-${slug}`,
    slug,
    name: slug,
    description: null,
    position,
    items,
  });

  it('AC-3.4.1 reads stored v1 data without the field as no collections', () => {
    expect(migrateGuestData({ deviceId: DEVICE_ID, saves: [] }, 1)?.collections).toEqual([]);
  });

  it('AC-3.4.1 keeps a valid set in position order with dense positions', () => {
    const collections = [stored('later', 5), stored('first', 2, [item(A, 7), item(B, 3)])];
    expect(migrateGuestData({ collections }, 1)?.collections).toEqual([
      { ...collections[1], position: 0, items: [item(B, 0), item(A, 1)] },
      { ...collections[0], position: 1 },
    ]);
  });

  it('AC-3.4.1 reads a stored set that is not a list as none, and flags it so storage is left alone', () => {
    expect(migrateGuestData({ collections: 'text' }, 1)?.collections).toEqual([]);
    expect(hasUnreadableCollectionsOrNotes({ collections: 'text' })).toBe(true);
    expect(hasUnreadableCollectionsOrNotes({ collections: [] })).toBe(false);
    expect(hasUnreadableCollectionsOrNotes({ saves: [] })).toBe(false);
  });

  it('AC-3.4.1 flags stored notes that are not an object, so storage is left alone', () => {
    expect(hasUnreadableCollectionsOrNotes({ notes: 'text' })).toBe(true);
    expect(hasUnreadableCollectionsOrNotes({ notes: [] })).toBe(true);
    expect(hasUnreadableCollectionsOrNotes({ notes: {} })).toBe(false);
    expect(hasUnreadableCollectionsOrNotes({ notes: null })).toBe(false);
  });

  it('AC-3.4.1 drops an invalid collection and keeps the valid ones', () => {
    const collections = [
      stored('good', 0),
      { ...stored('nameless', 1), name: '' },
      stored('Not A Slug', 2),
      'junk',
      stored('also-good', 3),
    ];
    expect(migrateGuestData({ collections }, 1)?.collections).toEqual([
      stored('good', 0),
      stored('also-good', 1),
    ]);
  });

  it('AC-3.4.1 drops an invalid item and keeps the collection and its other items', () => {
    const collections = [
      stored('a', 0, [item(A, 0), { ...item(B, 1), addedAt: 'yesterday' }, item('bad id', 2)]),
    ];
    expect(migrateGuestData({ collections }, 1)?.collections?.[0]?.items).toEqual([item(A, 0)]);
  });

  it('AC-3.4.1 keeps the first of a repeated slug or id', () => {
    const collections = [
      stored('same', 0),
      { ...stored('same', 1), id: 'other', name: 'Second' },
      { ...stored('different', 2), id: 'id-same' },
    ];
    expect(migrateGuestData({ collections }, 1)?.collections?.map((c) => c.id)).toEqual([
      'id-same',
    ]);
  });

  it('AC-3.4.1 keeps the first of a story repeated within one collection', () => {
    const collections = [stored('a', 0, [item(A, 0), item(B, 1), item(A, 2)])];
    expect(migrateGuestData({ collections }, 1)?.collections?.[0]?.items).toEqual([
      item(A, 0),
      item(B, 1),
    ]);
  });

  it('AC-3.4.1 keeps the first 50 collections of a longer set', () => {
    const collections = Array.from({ length: COLLECTIONS_MAX + 1 }, (_, index) =>
      stored(`board-${index}`, index),
    );
    const read = migrateGuestData({ collections }, 1)?.collections;
    expect(read).toHaveLength(COLLECTIONS_MAX);
    expect(read?.at(-1)?.slug).toBe(`board-${COLLECTIONS_MAX - 1}`);
  });

  it('AC-3.4.1 keeps the first 500 items of a longer collection', () => {
    const items = Array.from({ length: COLLECTION_ITEMS_MAX + 1 }, (_, index) =>
      item(`c${String(index).padStart(24, '0')}`, index),
    );
    const read = migrateGuestData({ collections: [stored('big', 0, items)] }, 1)?.collections;
    expect(read?.[0]?.items).toHaveLength(COLLECTION_ITEMS_MAX);
  });
});

describe('notes in migrateGuestData', () => {
  const UPDATED_AT = '2026-05-01T10:00:00.000Z';

  it('AC-3.4.2 keeps valid notes and reads stored data without the field as none', () => {
    const notes = { [A]: { note: 'Read **this**', updatedAt: UPDATED_AT } };
    expect(migrateGuestData({ notes }, 1)?.notes).toEqual(notes);
    expect(migrateGuestData({}, 1)?.notes).toEqual({});
  });

  it('AC-3.4.2 drops a note over 20,000 characters and keeps the others', () => {
    const notes = {
      [A]: { note: 'x'.repeat(NOTE_MAX_LENGTH + 1), updatedAt: UPDATED_AT },
      [B]: { note: 'x'.repeat(NOTE_MAX_LENGTH), updatedAt: UPDATED_AT },
    };
    expect(Object.keys(migrateGuestData({ notes }, 1)?.notes ?? {})).toEqual([B]);
  });

  it('AC-3.4.2 drops an empty note, a bad story id or date, and a field that is not an object', () => {
    const notes = {
      [A]: { note: '', updatedAt: UPDATED_AT },
      'not an id': { note: 'x', updatedAt: UPDATED_AT },
      [B]: { note: 'x', updatedAt: 'yesterday' },
    };
    expect(migrateGuestData({ notes }, 1)?.notes).toEqual({});
    expect(migrateGuestData({ notes: ['x'] }, 1)?.notes).toEqual({});
    expect(migrateGuestData({ notes: 7 }, 1)?.notes).toEqual({});
  });
});
