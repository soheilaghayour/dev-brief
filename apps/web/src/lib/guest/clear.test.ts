import { afterEach, describe, expect, it, vi } from 'vitest';

// The store latches into memory mode on a storage failure, so each test loads a fresh copy.
async function loadClear(localStorage: Partial<Storage>) {
  vi.resetModules();
  vi.stubGlobal('window', { localStorage });
  const { GUEST_STORAGE_KEY } = await import('./guestStore');
  const { clearGuestData } = await import('./clear');
  return { GUEST_STORAGE_KEY, clearGuestData };
}

afterEach(() => vi.unstubAllGlobals());

describe('clearGuestData', () => {
  it('AC-1.6.3 removes the guest store and leaves other keys', async () => {
    const items = new Map<string, string>();
    const { GUEST_STORAGE_KEY, clearGuestData } = await loadClear({
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
      removeItem: (key) => void items.delete(key),
    });
    items.set(GUEST_STORAGE_KEY, '{"version":1}');
    items.set('theme', 'dark');

    clearGuestData();

    expect([...items.keys()]).toEqual(['theme']);
  });

  it('does not throw when localStorage is unavailable', async () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    const { clearGuestData } = await loadClear({
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    expect(() => clearGuestData()).not.toThrow();
  });
});
