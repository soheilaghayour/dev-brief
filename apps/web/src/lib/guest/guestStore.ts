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
import { browserLocalStorage, createGuestStorage } from './guestStorage';

export const GUEST_STORAGE_KEY = 'devbrief:guest:v1';

export const guestStorage = createGuestStorage(browserLocalStorage);

// Zod is the heaviest part of first-load JS, so the parser loads on demand and must be provided before rehydrating.
type GuestParser = Pick<typeof import('./guestParser'), 'migrateGuestData' | 'mergeStoredGuest'>;
let parser: GuestParser | null = null;

export function provideGuestParser(loaded: GuestParser) {
  parser = loaded;
}

type GuestActions = {
  toggleSave: (storyId: string, now: Date) => ReturnType<typeof toggleSave>['outcome'];
  removeSaves: (storyIds: readonly string[]) => void;
  dismissHint: () => void;
  reset: () => void;
};
export type GuestStore = GuestData & GuestActions;

// The stored text is flat, so persist's `{ state, version }` envelope is unwrapped here.
const flatStorage: PersistStorage<GuestData> = {
  getItem: (key) => {
    const stored = parseStoredGuest(guestStorage.getItem(key));
    // Not yet trusted: `migrate` and `merge` parse the value before it reaches the store.
    return stored && { state: stored.state as GuestData, version: stored.version };
  },
  setItem: (key, value) => guestStorage.setItem(key, serializeGuest(value.state)),
  removeItem: (key) => guestStorage.removeItem(key),
};

function freshGuestData() {
  return createGuestData(crypto.randomUUID());
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
      removeSaves: (storyIds) => set({ saves: removeSaves(get().saves, storyIds) }),
      dismissHint: () => set({ hintDismissed: true }),
      reset: () => set(freshGuestData()),
    }),
    {
      name: GUEST_STORAGE_KEY,
      version: GUEST_STATE_VERSION,
      storage: flatStorage,
      // Hydrating after mount keeps the server HTML and the first client render equal.
      skipHydration: true,
      partialize: ({ deviceId, saves, hintDismissed }) => ({ deviceId, saves, hintDismissed }),
      // `merge` fills the fields the migration left out, so the partial value is safe here.
      migrate: (stored, version) => parser?.migrateGuestData(stored, version) as GuestData,
      merge: (stored, current) => ({ ...current, ...parser?.mergeStoredGuest(stored, current) }),
    },
  ),
);
