'use client';

import dynamic from 'next/dynamic';

/** The badge's Follow / Mute trigger, loaded after first paint; the server still renders its button, so nothing shifts. */
export const LazyPreferenceMenu = dynamic(() =>
  import('./PreferenceMenu').then((module) => module.PreferenceMenu),
);
