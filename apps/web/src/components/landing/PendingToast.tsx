'use client';

import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { takePendingToast } from '@/lib/guest/pendingToast';

/** Shows a toast queued before navigating here; Sonner downloads only when one is pending. */
export function PendingToast() {
  const [Toaster, setToaster] = useState<ComponentType | null>(null);

  useEffect(() => {
    void showPendingToast().then((loaded) => loaded && setToaster(() => loaded));
  }, []);

  return Toaster && <Toaster />;
}

async function showPendingToast() {
  const message = takePendingToast();
  if (!message) return null;
  const [{ Toaster }, { toast }] = await Promise.all([
    import('@/components/ui/Toaster'),
    import('sonner'),
  ]);
  // Sonner replays active toasts to a Toaster that mounts later, so firing first is safe.
  toast.success(message);
  return Toaster;
}
