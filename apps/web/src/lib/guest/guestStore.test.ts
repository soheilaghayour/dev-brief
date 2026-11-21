import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'devbrief:guest:v1';
const A = 'cstoryaaaaaaaaaaaaaaaaaa';
const B = 'cstorybbbbbbbbbbbbbbbbbb';
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
      prefs: { follow: { tags: [], sources: [] }, mute: { tags: [], sources: [] } },
      hintDismissed: false,
      collections: [],
      pendingMerge: false,
    });

    const reloaded = await loadStore({ localStorage });
    await reloaded.hydrateGuestStore();
    expect(reloaded.useGuestStore.getState().saves).toEqual(stored.saves);
    expect(reloaded.useGuestStore.getState().deviceId).toBe(stored.deviceId);
  });

  it('AC-2.5.1 keeps follows and mutes in the v1 store across a reload, and removing the sent set empties them', async () => {
    const { items, localStorage } = fakeLocalStorage();
    await loadStore({ localStorage });
    const guestPreferences = await import('./guestPreferences');
    expect(await guestPreferences.setGuestPreference('tag', 'react', 'mute')).toBe('changed');
    await guestPreferences.setGuestPreference('source', 'hn', 'follow');
    const prefs = {
      follow: { tags: [], sources: ['hn'] },
      mute: { tags: ['react' as const], sources: [] },
    };
    expect(JSON.parse(items.get(STORAGE_KEY) ?? 'null')).toMatchObject({ version: 1, prefs });

    const reloaded = await loadStore({ localStorage });
    await reloaded.hydrateGuestStore();
    expect(reloaded.useGuestStore.getState().prefs).toEqual(prefs);
    await (await import('./guestPreferences')).removeGuestPreferences(prefs);
    expect(reloaded.useGuestStore.getState().prefs).toEqual({
      follow: { tags: [], sources: [] },
      mute: { tags: [], sources: [] },
    });
  });

  it('AC-1.5.8 clearGuestData drops the preferences with the rest', async () => {
    const { localStorage } = fakeLocalStorage();
    const { useGuestStore, clearGuestData } = await loadStore({ localStorage });
    await (await import('./guestPreferences')).setGuestPreference('tag', 'rust', 'follow');
    clearGuestData();
    expect(useGuestStore.getState().prefs.follow.tags).toEqual([]);
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

  it('AC-3.4.1 AC-3.4.3 keeps collections in the v1 store across a reload, and unsaving a story removes it from every collection', async () => {
    const { items, localStorage } = fakeLocalStorage();
    await loadStore({ localStorage });
    const writers = await import('./guestCollections');
    const { useGuestStore } = await import('./guestStore');
    const first = await writers.createGuestCollection('Frontend Architecture');
    const second = await writers.createGuestCollection('Interview');
    await writers.addGuestCollectionItem(first.created?.id ?? '', A, NOW);
    await writers.addGuestCollectionItem(second.created?.id ?? '', A, NOW);
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([A]);

    const stored = JSON.parse(items.get(STORAGE_KEY) ?? 'null');
    expect(stored.version).toBe(1);
    expect(stored.collections.map((c: { slug: string }) => c.slug)).toEqual([
      'frontend-architecture',
      'interview',
    ]);

    const reloaded = await loadStore({ localStorage });
    await reloaded.hydrateGuestStore();
    expect(reloaded.useGuestStore.getState().collections).toEqual(stored.collections);

    reloaded.useGuestStore.getState().toggleSave(A, NOW);
    expect(reloaded.useGuestStore.getState().collections.map((c) => c.items.length)).toEqual([
      0, 0,
    ]);
  });

  it('removeSaves leaves collections alone, so a confirmed merge cannot lose boards that have not synced', async () => {
    const { localStorage } = fakeLocalStorage();
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    const writers = await import('./guestCollections');
    const { created } = await writers.createGuestCollection('Keep');
    await writers.addGuestCollectionItem(created?.id ?? '', A, NOW);

    useGuestStore.getState().removeSaves([A]);

    expect(useGuestStore.getState().collections[0]?.items).toHaveLength(1);
  });

  it('AC-3.4.1 purging a save of a story that no longer exists takes it out of every collection, and the counts match', async () => {
    const { localStorage } = fakeLocalStorage();
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    const writers = await import('./guestCollections');
    const first = await writers.createGuestCollection('One');
    const second = await writers.createGuestCollection('Two');
    for (const id of [first.created?.id ?? '', second.created?.id ?? ''])
      for (const story of [A, B]) await writers.addGuestCollectionItem(id, story, NOW);

    expect(useGuestStore.getState().purgeSaves([A])).toBe(1);

    const state = useGuestStore.getState();
    expect(state.saves.map((save) => save.storyId)).toEqual([B]);
    expect(state.collections.map((c) => c.items.map((i) => [i.storyId, i.position]))).toEqual([
      [[B, 0]],
      [[B, 0]],
    ]);
  });

  it('AC-3.4.1 never writes over stored collections that could not be read as a list', async () => {
    const text = JSON.stringify({
      version: 1,
      deviceId: DEVICE_ID,
      saves: [],
      collections: 'weird',
    });
    const { items, localStorage } = fakeLocalStorage({ [STORAGE_KEY]: text });
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();

    useGuestStore.getState().toggleSave(A, NOW);

    expect(useGuestStore.getState().saves).toHaveLength(1);
    expect(items.get(STORAGE_KEY)).toBe(text);
  });

  it('AC-3.4.1 the writers rename, move and delete on the stored data', async () => {
    const { localStorage } = fakeLocalStorage();
    const { useGuestStore, hydrateGuestStore } = await loadStore({ localStorage });
    await hydrateGuestStore();
    const writers = await import('./guestCollections');
    const a = await writers.createGuestCollection('Alpha');
    await writers.createGuestCollection('Beta');

    expect(await writers.renameGuestCollection(a.created?.id ?? '', 'Omega')).toBe('renamed');
    await writers.moveGuestCollection(a.created?.id ?? '', 'down');
    expect(useGuestStore.getState().collections.map((c) => [c.name, c.slug, c.position])).toEqual([
      ['Beta', 'beta', 0],
      ['Omega', 'alpha', 1],
    ]);

    await writers.deleteGuestCollection(a.created?.id ?? '');
    expect(useGuestStore.getState().collections.map((c) => c.name)).toEqual(['Beta']);
  });
});
