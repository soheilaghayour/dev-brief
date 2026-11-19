import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'devbrief:guest:v1';
const A = 'cstoryaaaaaaaaaaaaaaaaaa';
const NOW = new Date('2026-05-01T10:00:00.000Z');

// The store latches into memory mode on the first storage failure, so each test loads a fresh copy.
async function loadStore(browser: { localStorage: Storage } | { readonly localStorage: never }) {
  vi.resetModules();
  vi.stubGlobal('window', browser);
  const { provideGuestParser, useGuestStore } = await import('./guestStore');
  provideGuestParser(await import('./guestParser'));
  const { clearGuestData } = await import('./clear');
  return { useGuestStore, clearGuestData };
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
    const { useGuestStore } = await loadStore({ localStorage });
    useGuestStore.getState().toggleSave(A, NOW);

    const stored = JSON.parse(items.get(STORAGE_KEY) ?? 'null');
    expect(stored).toEqual({
      version: 1,
      deviceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      saves: [{ storyId: A, savedAt: NOW.toISOString() }],
      hintDismissed: false,
    });

    const reloaded = await loadStore({ localStorage });
    await reloaded.useGuestStore.persist.rehydrate();
    expect(reloaded.useGuestStore.getState().saves).toEqual(stored.saves);
    expect(reloaded.useGuestStore.getState().deviceId).toBe(stored.deviceId);
  });

  it('recovers from corrupted storage with an empty list', async () => {
    const { localStorage } = fakeLocalStorage({ [STORAGE_KEY]: '{"version":1,"saves":"nope"' });
    const { useGuestStore } = await loadStore({ localStorage });
    await useGuestStore.persist.rehydrate();
    expect(useGuestStore.getState().saves).toEqual([]);
  });

  it('migrates a stored value without a version and drops its invalid saves', async () => {
    const { localStorage } = fakeLocalStorage({
      [STORAGE_KEY]: JSON.stringify({
        saves: [{ storyId: A, savedAt: NOW.toISOString() }, { storyId: 3 }],
        hintDismissed: true,
      }),
    });
    const { useGuestStore } = await loadStore({ localStorage });
    await useGuestStore.persist.rehydrate();
    expect(useGuestStore.getState().saves).toEqual([{ storyId: A, savedAt: NOW.toISOString() }]);
    expect(useGuestStore.getState().hintDismissed).toBe(true);
  });

  it('AC-1.4.4 keeps saves in memory when localStorage throws', async () => {
    const blocked = {
      get localStorage(): Storage {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    const { useGuestStore } = await loadStore(blocked);
    await useGuestStore.persist.rehydrate();
    expect(() => useGuestStore.getState().toggleSave(A, NOW)).not.toThrow();
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([A]);
  });

  it('clearGuestData resets the store and removes the storage key', async () => {
    const { items, localStorage } = fakeLocalStorage();
    const { useGuestStore, clearGuestData } = await loadStore({ localStorage });
    useGuestStore.getState().toggleSave(A, NOW);
    useGuestStore.getState().dismissHint();
    expect(items.has(STORAGE_KEY)).toBe(true);

    clearGuestData();

    expect(items.has(STORAGE_KEY)).toBe(false);
    expect(useGuestStore.getState().saves).toEqual([]);
    expect(useGuestStore.getState().hintDismissed).toBe(false);
  });
});
