'use client';

import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

const FeedFilterLists = lazy(() =>
  import('./FeedFilterLists').then((module) => ({ default: module.FeedFilterLists })),
);

/** The filter column: shown in the desktop sidebar and inside the mobile bottom sheet; its lists load as a separate chunk. */
export function FeedFilters() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <FeedFilterLists />
    </Suspense>
  );
}
