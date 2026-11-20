'use client';

import dynamic from 'next/dynamic';

// Code-split boundaries: each island still renders on the server, but its code loads and hydrates
// after React boots instead of inside the boot task, which is the landing page's only long task (DECISIONS.md).
export const HeroPreview = dynamic(() =>
  import('./HeroPreview').then((module) => module.HeroPreview),
);
export const StatsPill = dynamic(() => import('./StatsPill').then((module) => module.StatsPill));
export const KeycapRow = dynamic(() => import('./KeycapRow').then((module) => module.KeycapRow));
export const ThemeToggle = dynamic(() =>
  import('@/components/layout/ThemeToggle').then((module) => module.ThemeToggle),
);
