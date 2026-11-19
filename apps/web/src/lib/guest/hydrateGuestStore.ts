import { create } from 'zustand';
import { provideGuestParser, useGuestStore } from './guestStore';

export const useGuestReady = create(() => ({ ready: false }));

/** Loads the stored guest data once after mount, then writes it back so the device id is stored from the first visit. */
export async function hydrateGuestStore() {
  if (useGuestReady.getState().ready) return;
  provideGuestParser(await import('./guestParser'));
  await useGuestStore.persist.rehydrate();
  useGuestStore.setState({});
  useGuestReady.setState({ ready: true });
}
