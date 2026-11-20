import { toggleGuestSave } from '@/lib/guest/guestSaves';
import { useGuestStore } from '@/lib/guest/guestStore';
import { followOtherTabs, hydrateGuestStore } from '@/lib/guest/hydrateGuestStore';

/** Loads the guest store and reports the saved ids now and on every change, here or in another tab. */
export function connectGuestSaves(onChange: (savedIds: ReadonlySet<string>) => void) {
  void hydrateGuestStore();
  function publish() {
    onChange(new Set(useGuestStore.getState().saves.map((save) => save.storyId)));
  }
  const stopStore = useGuestStore.subscribe(publish);
  const stopTabs = followOtherTabs();
  publish();
  return {
    toggle: (storyId: string) => toggleGuestSave(storyId, new Date()),
    disconnect() {
      stopStore();
      stopTabs();
    },
  };
}
