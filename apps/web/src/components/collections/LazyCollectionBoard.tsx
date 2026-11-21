'use client';

import dynamic from 'next/dynamic';
import { FeedSkeleton } from '@/components/feed/FeedSkeleton';

/** The board is fetched after first load: its content is the device's stored collections, so there is nothing to render on the server. */
export const LazyCollectionBoard = dynamic(
  () => import('./CollectionBoard').then((module) => module.CollectionBoard),
  { ssr: false, loading: () => <FeedSkeleton /> },
);
