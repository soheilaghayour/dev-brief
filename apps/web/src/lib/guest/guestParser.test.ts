import { COLLECTION_ITEMS_MAX, COLLECTIONS_MAX } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { migrateGuestData } from './guestParser';
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

  it.each([
    ['not a list', 'text'],
    ['an entry without a name', [{ ...stored('a', 0), name: '' }]],
    ['a slug that breaks the rule', [stored('Not A Slug', 0)]],
    ['a repeated slug', [stored('same', 0), { ...stored('same', 1), id: 'other' }]],
    ['an item without a date', [stored('a', 0, [{ ...item(A, 0), addedAt: 'yesterday' }])]],
  ])('AC-3.4.1 reads a set with %s as empty', (_case, collections) => {
    expect(migrateGuestData({ collections }, 1)?.collections).toEqual([]);
  });

  it('AC-3.4.1 reads a set over the 50-collection limit as empty, never a trimmed one', () => {
    const collections = Array.from({ length: COLLECTIONS_MAX + 1 }, (_, index) =>
      stored(`board-${index}`, index),
    );
    expect(migrateGuestData({ collections }, 1)?.collections).toEqual([]);
  });

  it('AC-3.4.1 reads a collection over the 500-item limit as an invalid set', () => {
    const items = Array.from({ length: COLLECTION_ITEMS_MAX + 1 }, (_, index) =>
      item(`c${String(index).padStart(24, '0')}`, index),
    );
    expect(migrateGuestData({ collections: [stored('big', 0, items)] }, 1)?.collections).toEqual(
      [],
    );
  });
});
