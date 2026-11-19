'use client';

import { useEffect } from 'react';
import { followOtherTabs, hydrateGuestStore } from '@/lib/guest/hydrateGuestStore';

function loadAndFollow() {
  hydrateGuestStore();
  return followOtherTabs();
}

/** Loads the guest store in the browser and keeps it in step with other tabs; renders nothing. */
export function GuestStoreHydrator() {
  useEffect(loadAndFollow, []);
  return null;
}
