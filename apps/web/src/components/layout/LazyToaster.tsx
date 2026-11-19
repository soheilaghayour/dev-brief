'use client';

import dynamic from 'next/dynamic';

// Toasts follow user actions, so sonner can arrive after first load instead of inside it.
export const LazyToaster = dynamic(() => import('@/components/ui/Toaster').then((m) => m.Toaster), {
  ssr: false,
});
