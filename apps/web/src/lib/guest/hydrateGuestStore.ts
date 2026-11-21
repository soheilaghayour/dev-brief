import { create } from 'zustand';
import type { GuestData } from './guestState';
import { GUEST_STORAGE_KEY, guestStorage, useGuestStore } from './guestStore';

export const useGuestReady = create(() => ({ ready: false }));

let loading: Promise<void> | undefined;

/**
 * Loads the stored guest data once, then writes it back so the device id is stored from the first visit.
 * The Zod parser is a separate chunk, so every read and write goes through this promise: nothing touches
 * storage before the parser is set (a write before hydration would replace the stored saves).
 */
export function hydrateGuestStore() {
  loading ??= (async () => {
    const { hasUnreadableCollections, mergeStoredGuest, migrateGuestData } =
      await import('./guestParser');
    useGuestStore.persist.setOptions({
      migrate: (stored, version) => migrateGuestData(stored, version) as GuestData,
      // `merge` fills the fields the migration left out, so the partial value is safe here.
      merge: (stored, current) => {
        // Reading them as none would erase them on the next write, so storage stays as it is.
        if (hasUnreadableCollections(stored)) guestStorage.useMemoryOnly();
        return { ...current, ...mergeStoredGuest(stored, current) };
      },
    });
    await useGuestStore.persist.rehydrate();
    // The first write after loading: the storage guard lets it through now.
    useGuestStore.setState({});
    useGuestReady.setState({ ready: true });
  })();
  return loading;
}

// Every change waits for the parser, loads the store and re-reads storage, so it builds on what any tab stored instead of replacing it.
export async function loadLatestGuestStore() {
  await hydrateGuestStore();
  await useGuestStore.persist.rehydrate();
}

/** Reloads the guest store when another tab changes it; returns the unsubscribe. */
export function followOtherTabs() {
  function reload(event: StorageEvent) {
    if (event.key === GUEST_STORAGE_KEY || event.key === null)
      void hydrateGuestStore().then(() => useGuestStore.persist.rehydrate());
  }
  window.addEventListener('storage', reload);
  return () => window.removeEventListener('storage', reload);
}
