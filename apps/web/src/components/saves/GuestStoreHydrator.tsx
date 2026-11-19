'use client';

import { useEffect } from 'react';
import { hydrateGuestStore } from '@/lib/guest/hydrateGuestStore';

/** Loads the guest store in the browser; renders nothing. */
export function GuestStoreHydrator() {
  useEffect(() => {
    void hydrateGuestStore();
  }, []);
  return null;
}
