import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage } from 'zustand/middleware';
import {
  createGuestData,
  GUEST_STATE_VERSION,
  parseStoredGuest,
  removeSaves,
  serializeGuest,
  toggleSave,
  withoutStoriesInCollections,
  type GuestData,
} from './guestState';
import { browserLocalStorage, createGuestStorage } from './guestStorage';

export const GUEST_STORAGE_KEY = 'devbrief:guest:v1';

export const guestStorage = createGuestStorage(browserLocalStorage);

type GuestActions = {
  toggleSave: (storyId: string, now: Date) => ReturnType<typeof toggleSave>['outcome'];
  removeSaves: (storyIds: readonly string[]) => number;
  purgeSaves: (storyIds: readonly string[]) => number;
  dismissHint: () => void;
  setPendingMerge: (pending: boolean) => void;
  reset: () => void;
};
export type GuestStore = GuestData & GuestActions;

// The stored text is flat, so persist's `{ state, version }` envelope is unwrapped here.
const flatStorage: PersistStorage<GuestData> = {
  getItem: (key) => {
    const stored = parseStoredGuest(guestStorage.getItem(key));
    if (stored && stored.version > GUEST_STATE_VERSION) {
      // Data from a newer app version (after a rollback) must not be overwritten by this one.
      guestStorage.useMemoryOnly();
      return null;
    }
    // Not yet trusted: the parser's `migrate` and `merge` parse the value before it reaches the store.
    return stored && { state: stored.state as GuestData, version: stored.version };
  },
  setItem: (key, value) => {
    // A write before hydration would replace the stored saves with the fresh initial state.
    if (useGuestStore.persist.hasHydrated()) guestStorage.setItem(key, serializeGuest(value.state));
  },
  removeItem: (key) => guestStorage.removeItem(key),
};

// `crypto.randomUUID` is missing outside secure contexts (plain http), where `getRandomValues` still works.
export function newUuid() {
  const hex = Array.from(crypto.getRandomValues(new Uint32Array(4)), (word) =>
    word.toString(16).padStart(8, '0'),
  ).join('');
  const variant = '89ab'[Number.parseInt(hex.slice(16, 17), 16) & 3];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function freshGuestData() {
  return createGuestData(newUuid());
}

export const useGuestStore = create<GuestStore>()(
  persist(
    (set, get) => ({
      ...freshGuestData(),
      toggleSave: (storyId, now) => {
        const { outcome, saves } = toggleSave(get().saves, storyId, now);
        if (outcome === 'removed') {
          set({ saves, collections: withoutStoriesInCollections(get().collections, [storyId]) });
        } else if (outcome === 'added') {
          set({ saves });
        }
        return outcome;
      },
      // Not stripped from collections: a confirmed merge removes saves whose collections still have to sync.
      removeSaves: (storyIds) => {
        const saves = removeSaves(get().saves, storyIds);
        const removed = get().saves.length - saves.length;
        set({ saves });
        return removed;
      },
      // For stories that no longer exist: nothing can show them, so they leave every collection too.
      purgeSaves: (storyIds) => {
        const saves = removeSaves(get().saves, storyIds);
        const removed = get().saves.length - saves.length;
        set({ saves, collections: withoutStoriesInCollections(get().collections, storyIds) });
        return removed;
      },
      dismissHint: () => set({ hintDismissed: true }),
      setPendingMerge: (pendingMerge) => set({ pendingMerge }),
      reset: () => set(freshGuestData()),
    }),
    {
      name: GUEST_STORAGE_KEY,
      version: GUEST_STATE_VERSION,
      storage: flatStorage,
      // Hydrating after mount keeps the server HTML and the first client render equal.
      skipHydration: true,
      partialize: ({ deviceId, saves, prefs, collections, hintDismissed, pendingMerge }) => ({
        deviceId,
        saves,
        prefs,
        collections,
        hintDismissed,
        pendingMerge,
      }),
      // `migrate` and `merge` (the Zod parser) are set by hydrateGuestStore once it has loaded.
    },
  ),
);
