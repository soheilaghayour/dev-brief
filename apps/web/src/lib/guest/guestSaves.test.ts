import { afterEach, describe, expect, it, vi } from 'vitest';

const KEY = 'devbrief:guest:v1';
const DEVICE_ID = '3f2b8f0e-6a52-4c53-9a39-6b1c2f1e7a10';
const A = 'cstoryaaaaaaaaaaaaaaaaaa';
const B = 'cstorybbbbbbbbbbbbbbbbbb';
const C = 'cstorycccccccccccccccccc';
const NOW = new Date('2026-01-03T00:00:00.000Z');

function stored(saves: string[]) {
  return JSON.stringify({
    version: 1,
    deviceId: DEVICE_ID,
    saves: saves.map((storyId) => ({ storyId, savedAt: '2026-01-01T00:00:00.000Z' })),
    hintDismissed: true,
  });
}

type StorageListener = (event: { key: string | null }) => void;

async function load(initial: string) {
  vi.resetModules();
  const items = new Map([[KEY, initial]]);
  const listeners: StorageListener[] = [];
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    },
    addEventListener: (_type: string, listener: StorageListener) => void listeners.push(listener),
    removeEventListener: () => undefined,
  });
  const { useGuestStore } = await import('./guestStore');
  const { hydrateGuestStore, followOtherTabs } = await import('./hydrateGuestStore');
  const { toggleGuestSave, removeGuestSaves } = await import('./guestSaves');
  const otherTabWrote = (key: string | null) => listeners.forEach((listener) => listener({ key }));
  return {
    items,
    useGuestStore,
    hydrateGuestStore,
    followOtherTabs,
    toggleGuestSave,
    removeGuestSaves,
    otherTabWrote,
  };
}

const idsOf = (text: string | undefined) =>
  (JSON.parse(text ?? '{}').saves as { storyId: string }[]).map((save) => save.storyId).sort();

afterEach(() => vi.unstubAllGlobals());

describe('guest saves', () => {
  it('keeps the stored saves when a story is saved before the store has loaded', async () => {
    const { items, useGuestStore, toggleGuestSave } = await load(stored([A, B]));

    await toggleGuestSave(C, NOW);

    expect(
      useGuestStore
        .getState()
        .saves.map((save) => save.storyId)
        .sort(),
    ).toEqual([A, B, C]);
    expect(idsOf(items.get(KEY))).toEqual([A, B, C]);
    expect(JSON.parse(items.get(KEY) ?? '{}')).toMatchObject({
      deviceId: DEVICE_ID,
      hintDismissed: true,
    });
  });

  it('drops invalid stored entries when a story is saved before the parser has loaded', async () => {
    const withJunk = JSON.stringify({
      ...JSON.parse(stored([A])),
      saves: [...JSON.parse(stored([A])).saves, { storyId: 42, savedAt: 'nope' }],
    });
    const { items, toggleGuestSave } = await load(withJunk);

    await toggleGuestSave(C, NOW);

    expect(idsOf(items.get(KEY))).toEqual([A, C]);
  });

  it('loads the store once however many callers ask', async () => {
    const { hydrateGuestStore, useGuestStore } = await load(stored([A]));
    const rehydrate = vi.spyOn(useGuestStore.persist, 'rehydrate');

    await Promise.all([hydrateGuestStore(), hydrateGuestStore()]);

    expect(rehydrate).toHaveBeenCalledTimes(1);
  });

  it('adds to what another tab stored instead of overwriting it', async () => {
    const { items, hydrateGuestStore, toggleGuestSave } = await load(stored([A]));
    await hydrateGuestStore();

    items.set(KEY, stored([A, B]));
    await toggleGuestSave(C, NOW);

    expect(idsOf(items.get(KEY))).toEqual([A, B, C]);
  });

  it('removes unavailable saves once and reports how many were there', async () => {
    const { removeGuestSaves } = await load(stored([A, B]));

    expect(await removeGuestSaves([B, 'missing'])).toBe(1);
    expect(await removeGuestSaves([B, 'missing'])).toBe(0);
  });

  it('reloads the store when another tab changes the stored saves', async () => {
    const { items, useGuestStore, hydrateGuestStore, followOtherTabs, otherTabWrote } = await load(
      stored([A]),
    );
    await hydrateGuestStore();
    followOtherTabs();

    items.set(KEY, stored([A, B]));
    otherTabWrote(KEY);
    await vi.waitFor(() =>
      expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([A, B]),
    );

    items.set(KEY, stored([C]));
    otherTabWrote('unrelated');
    expect(useGuestStore.getState().saves.map((save) => save.storyId)).toEqual([A, B]);
  });
});
