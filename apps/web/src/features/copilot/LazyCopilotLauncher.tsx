'use client';

import dynamic from 'next/dynamic';

/** The header's Ask button and ⌘K binding, fetched after first load like the hotkey bindings: reading the feed does not need them. */
export const LazyCopilotLauncher = dynamic(
  () => import('./CopilotLauncher').then((module) => module.CopilotLauncher),
  { ssr: false },
);
