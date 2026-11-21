'use client';

import { lazy, Suspense } from 'react';
import { useSignOutConfirm } from '@/lib/auth/signOutConfirm';

// The dialog (and Radix Dialog with it) is fetched the first time a sign-out needs the question.
const SignOutConfirmDialog = lazy(() =>
  import('./SignOutConfirmDialog').then((module) => ({ default: module.SignOutConfirmDialog })),
);

/** Mounted once with the account slot: asks before a sign-out that would remove data the account lacks. */
export function SignOutConfirm() {
  const unsynced = useSignOutConfirm((state) => state.unsynced);
  if (!unsynced) return null;
  return (
    <Suspense fallback={null}>
      <SignOutConfirmDialog unsynced={unsynced} />
    </Suspense>
  );
}
