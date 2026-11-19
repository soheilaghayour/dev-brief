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
  type GuestData,
} from './guestState';
import { mergeStoredGuest, migrateGuestData } from './guestParser';
import { browserLocalStorage, createGuestStorage } from './guestStorage';

export const GUEST_STORAGE_KEY = 'devbrief:guest:v1';

export const guestStorage = createGuestStorage(browserLocalStorage);

type GuestActions = {
  toggleSave: (storyId: string, now: Date) => ReturnType<typeof toggleSave>['outcome'];
  removeSaves: (storyIds: readonly string[]) => number;
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
    // Not yet trusted: `migrate` and `merge` parse the value before it reaches the store.
    return stored && { state: stored.state as GuestData, version: stored.version };
  },
  setItem: (key, value) => {
    // A write before hydration would replace the stored saves with the fresh initial state.
    if (useGuestStore.persist.hasHydrated()) guestStorage.setItem(key, serializeGuest(value.state));
  },
  removeItem: (key) => guestStorage.removeItem(key),
};

// `crypto.randomUUID` is missing outside secure contexts (plain http), where `getRandomValues` still works.
function newDeviceId() {
  const hex = Array.from(crypto.getRandomValues(new Uint32Array(4)), (word) =>
    word.toString(16).padStart(8, '0'),
  ).join('');
  const variant = '89ab'[Number.parseInt(hex.slice(16, 17), 16) & 3];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function freshGuestData() {
  return createGuestData(newDeviceId());
}

export const useGuestStore = create<GuestStore>()(
  persist(
    (set, get) => ({
      ...freshGuestData(),
      toggleSave: (storyId, now) => {
        const { outcome, saves } = toggleSave(get().saves, storyId, now);
        if (outcome !== 'full') set({ saves });
        return outcome;
      },
      removeSaves: (storyIds) => {
        const saves = removeSaves(get().saves, storyIds);
        const removed = get().saves.length - saves.length;
        set({ saves });
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
      partialize: ({ deviceId, saves, hintDismissed, pendingMerge }) => ({
        deviceId,
        saves,
        hintDismissed,
        pendingMerge,
      }),
      // `merge` fills the fields the migration left out, so the partial value is safe here.
      migrate: (stored, version) => migrateGuestData(stored, version) as GuestData,
      merge: (stored, current) => ({ ...current, ...mergeStoredGuest(stored, current) }),
    },
  ),
);
