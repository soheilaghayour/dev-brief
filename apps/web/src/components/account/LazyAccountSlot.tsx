'use client';

import dynamic from 'next/dynamic';

/** The header's account area, fetched after first load: reading the feed does not need the auth UI. */
export const LazyAccountSlot = dynamic(
  () => import('./AccountSlot').then((module) => module.AccountSlot),
  {
    ssr: false,
    // Same reserved width as AccountSlot's pending state, so the header does not shift when the chunk arrives.
    loading: () => <div className="h-7 w-16" aria-hidden />,
  },
);
