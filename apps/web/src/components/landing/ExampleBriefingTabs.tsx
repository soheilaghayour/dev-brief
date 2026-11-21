'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { BriefingSkeleton } from '@/features/copilot/BriefingSkeleton';
import { LazyBriefingView } from '@/features/copilot/LazyBriefingView';
import { cn } from '@/lib/cn';
import { nextTabIndex, storedBriefingSource, type ExampleBriefing } from './exampleBriefingData';

// Starts the renderer download a little before the panel is on screen.
const LOAD_MARGIN = '300px 0px';

/** Tabs labelled with the questions; the panel shows the skeleton until it nears the viewport, then the stored briefing. */
export function ExampleBriefingTabs({ examples }: { examples: readonly ExampleBriefing[] }) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selected, setSelected] = useState(0);
  const [isNear, setIsNear] = useState(false);
  const sources = useMemo(
    () => examples.map(({ messages }) => storedBriefingSource(messages)),
    [examples],
  );

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsNear(true);
        observer.disconnect();
      },
      { rootMargin: LOAD_MARGIN },
    );
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, selected, examples.length);
    if (next === undefined) return;
    event.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  }

  const source = sources[selected];
  return (
    <div>
      {/* The tablist owns the arrow keys for its tabs (roving tabindex). */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        role="tablist"
        aria-label="Example questions"
        onKeyDown={moveTab}
        className="grid gap-2 md:grid-cols-3"
      >
        {examples.map((example, index) => (
          <Button
            key={example.slug}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={index === selected}
            aria-controls={`${id}-panel`}
            tabIndex={index === selected ? 0 : -1}
            variant="outline"
            onClick={() => setSelected(index)}
            className={cn(
              'h-auto justify-start px-4 py-3 text-left whitespace-normal',
              index === selected && 'bg-accent text-accent-foreground border-primary/40',
            )}
          >
            {example.question}
          </Button>
        ))}
      </div>
      <div
        ref={panelRef}
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${selected}`}
        tabIndex={0}
        style={{ '--briefing-sticky-top': '0px' } as CSSProperties}
        className="bg-background mt-4 isolate h-[36rem] overflow-y-auto rounded-lg border p-4 text-left md:px-6"
      >
        {isNear && source ? (
          <LazyBriefingView key={examples[selected]?.slug} source={source} />
        ) : (
          <BriefingSkeleton />
        )}
      </div>
    </div>
  );
}
