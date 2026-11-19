import { GUEST_STORAGE_KEY, guestStorage, useGuestStore } from './guestStore';

/** Resets the guest store and removes its storage key. */
export function clearGuestData() {
  useGuestStore.getState().reset();
  guestStorage.removeItem(GUEST_STORAGE_KEY);
}
