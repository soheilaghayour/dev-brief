'use client';

import { lazy, Suspense, startTransition, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import type { ExampleBriefing } from './exampleBriefingData';

// The live tabs and the renderer stay out of the landing's first load; React.lazy needs no extra runtime.
const ExampleBriefingTabs = lazy(() => import('./ExampleBriefingTabs'));

// Starts the download a little before the section is on screen.
const LOAD_MARGIN = '300px 0px';

/** What the visitor did on the server-rendered tabs before the live ones arrived. */
export type StaticTabsHandoff = {
  selected: number;
  /** Asked while the live tabs render, when the server-rendered ones are still in the page. */
  hadFocus: () => boolean;
};

type ExampleBriefingsLoaderProps = {
  examples: readonly ExampleBriefing[];
  isSample: boolean;
  /** The server-rendered tabs: shown until the live tabs arrive. */
  children: ReactNode;
};

/** Swaps the server-rendered tabs for the live ones when the section nears the viewport or is touched. */
export function ExampleBriefingsLoader({
  examples,
  isSample,
  children,
}: ExampleBriefingsLoaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handoffRef = useRef<StaticTabsHandoff>({
    selected: 0,
    hadFocus: () => containerRef.current?.contains(document.activeElement) ?? false,
  });
  const [isNear, setIsNear] = useState(false);

  // A transition keeps the server-rendered tabs on screen, focus included, until the chunk has arrived.
  function startLoading() {
    startTransition(() => setIsNear(true));
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        startLoading();
        observer.disconnect();
      },
      { rootMargin: LOAD_MARGIN },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const tab = (event.target as Element).closest('[role="tab"]');
    if (tab) handoffRef.current.selected = [...tab.parentElement!.children].indexOf(tab);
    startLoading();
  }

  // The server-rendered tabs have no handlers, so the arrows are replayed here (Home and End wait for the live tabs) until the live tabs take over.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const tab = (event.target as Element).closest('[role="tab"]');
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!tab || !step) return;
    const next = (handoffRef.current.selected + step + examples.length) % examples.length;
    event.preventDefault();
    handoffRef.current.selected = next;
    (tab.parentElement!.children[next] as HTMLElement).focus();
    startLoading();
  }

  // The wrapper only listens for events bubbling up from the tabs; the tabs are the controls.
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={containerRef}
      onFocus={startLoading}
      onClick={handleClick}
      onKeyDown={isNear ? undefined : handleKeyDown}
    >
      <Suspense fallback={children}>
        {isNear ? (
          <ExampleBriefingTabs
            examples={examples}
            isSample={isSample}
            handoff={handoffRef.current}
          />
        ) : (
          children
        )}
      </Suspense>
    </div>
  );
}
