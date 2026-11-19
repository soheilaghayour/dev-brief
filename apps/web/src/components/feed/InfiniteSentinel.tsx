'use client';

import { useEffect, useRef } from 'react';

type InfiniteSentinelProps = {
  onVisible: () => void;
  /** Stops watching, e.g. while a page loads or after the last page. */
  disabled: boolean;
  /** Changes whenever content was added, so a sentinel that is still in view is checked again. */
  loadedCount: number;
};

const PRELOAD_DISTANCE = '600px';

/** An invisible marker below the list that calls `onVisible` shortly before it scrolls into view. */
export function InfiniteSentinel({ onVisible, disabled, loadedCount }: InfiniteSentinelProps) {
  const markerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || disabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onVisible();
      },
      { rootMargin: PRELOAD_DISTANCE },
    );
    observer.observe(marker);
    return () => observer.disconnect();
  }, [onVisible, disabled, loadedCount]);

  return <div ref={markerRef} aria-hidden="true" className="h-px" />;
}
