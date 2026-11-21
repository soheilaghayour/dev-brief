'use client';

import { useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { LazyBriefingView } from '@/features/copilot/LazyBriefingView';
import { cn } from '@/lib/cn';
import type { ExampleBriefing } from './exampleBriefingData';
import {
  PANEL_CLASS,
  PANEL_STYLE,
  SELECTED_TAB_CLASS,
  TABLIST_CLASS,
  TAB_CLASS,
} from './exampleTabStyles';
import { nextTabIndex, storedBriefingSource } from './storedBriefing';

/** The live tabs, loaded once the section nears the viewport: each tab shows its stored briefing through the renderer. */
export default function ExampleBriefingTabs({
  examples,
}: {
  examples: readonly ExampleBriefing[];
}) {
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  const source = useMemo(
    () => (example ? storedBriefingSource(example.messages) : undefined),
    [example],
  );

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(event.key, selected, examples.length);
    if (next === undefined) return;
    event.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div>
      {/* The tablist owns the arrow keys for its tabs (roving tabindex). */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div
        role="tablist"
        aria-label="Example questions"
        onKeyDown={moveTab}
        className={TABLIST_CLASS}
      >
        {examples.map((tab, index) => (
          <Button
            key={tab.slug}
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
            className={cn(TAB_CLASS, index === selected && SELECTED_TAB_CLASS)}
          >
            {tab.question}
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${selected}`}
        tabIndex={0}
        style={PANEL_STYLE}
        className={PANEL_CLASS}
      >
        {source && <LazyBriefingView key={example?.slug} source={source} />}
      </div>
    </div>
  );
}
