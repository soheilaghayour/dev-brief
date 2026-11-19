import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearGuestData, GUEST_STORAGE_KEY } from './clear';

afterEach(() => vi.unstubAllGlobals());

describe('clearGuestData', () => {
  it('AC-1.6.3 removes the guest store and leaves other keys', () => {
    const storage = new Map([
      [GUEST_STORAGE_KEY, '{"version":1}'],
      ['theme', 'dark'],
    ]);
    vi.stubGlobal('localStorage', {
      removeItem: (key: string) => storage.delete(key),
    });
    clearGuestData();
    expect([...storage.keys()]).toEqual(['theme']);
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => clearGuestData()).not.toThrow();
  });
});
