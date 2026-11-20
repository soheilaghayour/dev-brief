'use client';

import { useEffect, useLayoutEffect } from 'react';
import { followOtherTabs, hydrateGuestStore } from '@/lib/guest/hydrateGuestStore';
import { applyStoredMutes } from '@/lib/guest/storedMutes';
import { useMergeOnSignIn } from './useMergeOnSignIn';

function loadAndFollow() {
  void hydrateGuestStore();
  return followOtherTabs();
}

/** Loads the guest store in the browser, keeps it in step with other tabs and merges it into the account on sign-in; renders nothing. */
export function GuestStoreHydrator() {
  useLayoutEffect(applyStoredMutes, []);
  useEffect(loadAndFollow, []);
  useMergeOnSignIn();
  return null;
}
