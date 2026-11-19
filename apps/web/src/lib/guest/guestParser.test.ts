import { describe, expect, it } from 'vitest';
import { migrateGuestData } from './guestParser';
import { createGuestData, MAX_GUEST_SAVES } from './guestState';

const DEVICE_ID = '3f2b8f0e-6a52-4c53-9a39-6b1c2f1e7a10';
const A = 'cstoryaaaaaaaaaaaaaaaaaa';

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
      hintDismissed: false,
    });
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
