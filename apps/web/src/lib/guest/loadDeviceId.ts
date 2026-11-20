import { useGuestStore } from './guestStore';
import { hydrateGuestStore } from './hydrateGuestStore';

/** This device's id once the stored guest data is loaded; before that the store holds a throwaway one. */
export async function loadDeviceId() {
  await hydrateGuestStore();
  return useGuestStore.getState().deviceId;
}
