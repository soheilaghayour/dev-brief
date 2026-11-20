import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'devbrief:guest:v1';
const A = 'cstoryaaaaaaaaaaaaaaaaaa';
const DEVICE_ID = '3f2b8f0e-6a52-4c53-9a39-6b1c2f1e7a10';
const NOW = new Date('2026-05-01T10:00:00.000Z');

// The store latches into memory mode on the first storage failure, so each test loads a fresh copy.
async function loadStore(browser: { localStorage: Storage } | { readonly localStorage: never }) {
  vi.resetModules();
  vi.stubGlobal('window', browser);
  const { useGuestStore } = await import('./guestStore');
  const { clearGuestData } = await import('./clear');
  const { hydrateGuestStore } = await import('./hydrateGuestStore');
  return { useGuestStore, clearGuestData, hydrateGuestStore };
}

function fakeLocalStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  } as Storage;
  return { items, localStorage };
}

beforeEach(() => {
  vi.stubGlobal('window', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('guest store', () => {
  it('AC-1.4.2 persists under devbrief:guest:v1 in the flat shape and survives a reload', async () => {
    const { items, localStorage } = fakeLocalStorage();
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    useGuestStore.getState().toggleSave(A, NOW);

    const stored = JSON.parse(items.get(STORAGE_KEY) ?? 'null');
    expect(stored).toEqual({
      version: 1,
      deviceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      saves: [{ storyId: A, savedAt: NOW.toISOString() }],
      hintDismissed: false,
      pendingMerge: false,
    });

    const reloaded = await loadStore({ localStorage });
    await reloaded.hydrateGuestStore();
    expect(reloaded.useGuestStore.getState().saves).toEqual(stored.saves);
    expect(reloaded.useGuestStore.getState().deviceId).toBe(stored.deviceId);
  });

  it('recovers from corrupted storage with an empty list', async () => {
    const { localStorage } = fakeLocalStorage({ [STORAGE_KEY]: '{"version":1,"saves":"nope"' });
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    expect(useGuestStore.getState().saves).toEqual([]);
  });

  it('migrates a stored value without a version and drops its invalid saves', async () => {
    const { localStorage } = fakeLocalStorage({
      [STORAGE_KEY]: JSON.stringify({
        saves: [{ storyId: A, savedAt: NOW.toISOString() }, { storyId: 3 }],
        hintDismissed: true,
      }),
    });
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    expect(useGuestStore.getState().saves).toEqual([{ storyId: A, savedAt: NOW.toISOString() }]);
    expect(useGuestStore.getState().hintDismissed).toBe(true);
  });

  it('AC-1.4.4 keeps saves in memory when localStorage throws', async () => {
    const blocked = {
      get localStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const { useGuestStore, hydrateGuestStore } = await loadStore(blocked);
    await hydrateGuestStore();
    expect(() => useGuestStore.getState().toggleSave(A, NOW)).not.toThrow();
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([A]);
  });

  it('clearGuestData resets the store and removes the storage key', async () => {
    const { items, localStorage } = fakeLocalStorage();
    const { useGuestStore, clearGuestData, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    useGuestStore.getState().toggleSave(A, NOW);
    useGuestStore.getState().dismissHint();
    expect(items.has(STORAGE_KEY)).toBe(true);

    clearGuestData();

    expect(items.has(STORAGE_KEY)).toBe(false);
    expect(useGuestStore.getState().saves).toEqual([]);
    expect(useGuestStore.getState().hintDismissed).toBe(false);
  });

  it('keeps data written by a newer app version untouched', async () => {
    const newer = JSON.stringify({ version: 2, deviceId: DEVICE_ID, saves: [], extra: true });
    const { items, localStorage } = fakeLocalStorage({ [STORAGE_KEY]: newer });
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    useGuestStore.getState().toggleSave(A, NOW);

    expect(items.get(STORAGE_KEY)).toBe(newer);
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([A]);
  });

  it('removeSaves returns how many saves it removed', async () => {
    const { localStorage } = fakeLocalStorage();
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    useGuestStore.getState().toggleSave(A, NOW);

    expect(useGuestStore.getState().removeSaves([A, 'missing'])).toBe(1);
    expect(useGuestStore.getState().removeSaves([A])).toBe(0);
  });

  it('does not write while the store has not loaded', async () => {
    const { items, localStorage } = fakeLocalStorage({ [STORAGE_KEY]: '{"version":1}' });
    const { useGuestStore } = await loadStore({ localStorage });
    useGuestStore.getState().toggleSave(A, NOW);

    expect(items.get(STORAGE_KEY)).toBe('{"version":1}');
  });
});
