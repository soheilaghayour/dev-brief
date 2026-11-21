'use client';

import { useMemo } from 'react';
import { LazyBriefingView } from '@/features/copilot/LazyBriefingView';
import type { ExampleBriefing } from './exampleBriefingData';
import { storedBriefingSource } from './storedBriefing';

/** Example briefing #1 in the hero window; its own module so the renderer's wrapper loads only when Briefing is pressed. */
export default function HeroBriefing({ briefing }: { briefing: ExampleBriefing }) {
  const source = useMemo(() => storedBriefingSource(briefing.messages), [briefing]);
  return <LazyBriefingView source={source} />;
}
