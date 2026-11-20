'use client';

import { useEffect } from 'react';
import { followOtherTabs, hydrateGuestStore } from '@/lib/guest/hydrateGuestStore';
import { useMergeOnSignIn } from './useMergeOnSignIn';

function loadAndFollow() {
  void hydrateGuestStore();
  return followOtherTabs();
}

/** Loads the guest store in the browser, keeps it in step with other tabs and merges it into the account on sign-in; renders nothing. */
export function GuestStoreHydrator() {
  useEffect(loadAndFollow, []);
  useMergeOnSignIn();
  return null;
}
