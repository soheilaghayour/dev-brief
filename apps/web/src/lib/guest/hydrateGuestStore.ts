import { create } from 'zustand';
import { GUEST_STORAGE_KEY, useGuestStore } from './guestStore';

export const useGuestReady = create(() => ({ ready: false }));

/** Loads the stored guest data once, then writes it back so the device id is stored from the first visit. */
export function hydrateGuestStore() {
  if (useGuestReady.getState().ready) return;
  useGuestStore.persist.rehydrate();
  // The first write after loading: the storage guard lets it through now.
  useGuestStore.setState({});
  useGuestReady.setState({ ready: true });
}

/** Reloads the guest store when another tab changes it; returns the unsubscribe. */
export function followOtherTabs() {
  function reload(event: StorageEvent) {
    if (event.key === GUEST_STORAGE_KEY || event.key === null) useGuestStore.persist.rehydrate();
  }
  window.addEventListener('storage', reload);
  return () => window.removeEventListener('storage', reload);
}
