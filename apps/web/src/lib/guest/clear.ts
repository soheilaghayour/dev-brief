export const GUEST_STORAGE_KEY = 'devbrief:guest:v1';

/** Removes the guest data stored on this device. */
export function clearGuestData() {
  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch {
    // localStorage can be unavailable; then there is nothing stored to clear.
  }
}
