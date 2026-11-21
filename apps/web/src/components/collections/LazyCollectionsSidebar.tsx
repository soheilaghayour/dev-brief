'use client';

import dynamic from 'next/dynamic';
import { CollectionsSidebarSkeleton } from './CollectionsSidebarSkeleton';

/** The sidebar is fetched after first load: it needs the stored collections, which exist only after hydration anyway. */
export const LazyCollectionsSidebar = dynamic(
  () => import('./CollectionsSidebar').then((module) => module.CollectionsSidebar),
  { ssr: false, loading: () => <CollectionsSidebarSkeleton /> },
);
