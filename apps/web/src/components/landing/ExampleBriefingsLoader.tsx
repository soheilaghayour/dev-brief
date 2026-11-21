'use client';

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ExampleBriefing } from './exampleBriefingData';

// The live tabs and the renderer stay out of the landing's first load; React.lazy needs no extra runtime.
const ExampleBriefingTabs = lazy(() => import('./ExampleBriefingTabs'));

// Starts the download a little before the section is on screen.
const LOAD_MARGIN = '300px 0px';

type ExampleBriefingsLoaderProps = {
  examples: readonly ExampleBriefing[];
  /** The server-rendered tabs: shown until the live tabs arrive. */
  children: ReactNode;
};

/** Swaps the server-rendered tabs for the live ones when the section nears the viewport. */
export function ExampleBriefingsLoader({ examples, children }: ExampleBriefingsLoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNear, setIsNear] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsNear(true);
        observer.disconnect();
      },
      { rootMargin: LOAD_MARGIN },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef}>
      {isNear ? (
        <Suspense fallback={children}>
          <ExampleBriefingTabs examples={examples} />
        </Suspense>
      ) : (
        children
      )}
    </div>
  );
}
