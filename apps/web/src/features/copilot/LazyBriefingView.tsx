'use client';

import dynamic from 'next/dynamic';
import { BriefingSkeleton } from './BriefingSkeleton';

// `@a2ui/react` defines a custom element at module load, so it cannot run on the server; ssr:false also keeps it out of first-load JS.
export const LazyBriefingView = dynamic(() => import('./BriefingView'), {
  ssr: false,
  loading: () => <BriefingSkeleton />,
});
