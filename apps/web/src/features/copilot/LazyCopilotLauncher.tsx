'use client';

import dynamic from 'next/dynamic';
import { LAUNCHER_SIZE } from './launcherSize';

/** The header's Ask button, fetched after first load: reading the feed does not need them. */
export const LazyCopilotLauncher = dynamic(
  () => import('./CopilotLauncher').then((module) => module.CopilotLauncher),
  // Holds the button's room, so the controls beside it stay put when it arrives.
  { ssr: false, loading: () => <div aria-hidden="true" className={LAUNCHER_SIZE} /> },
);
