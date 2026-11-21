import { Button } from '@/components/ui/Button';
import { BriefingSkeleton } from '@/features/copilot/BriefingSkeleton';
import { cn } from '@/lib/cn';
import type { ExampleBriefing } from './exampleBriefingData';
import {
  PANEL_CLASS,
  PANEL_STYLE,
  SAMPLE_LABEL_ID,
  SELECTED_TAB_CLASS,
  TABLIST_CLASS,
  TAB_CLASS,
} from './exampleTabStyles';

/** The tabs as server-rendered HTML, with the skeleton in the panel: what shows until the live tabs load. */
export function ExampleBriefingTabsStatic({
  examples,
  isSample,
}: {
  examples: readonly ExampleBriefing[];
  isSample: boolean;
}) {
  return (
    <div>
      <div role="tablist" aria-label="Example questions" className={TABLIST_CLASS}>
        {examples.map((example, index) => (
          <Button
            key={example.slug}
            role="tab"
            aria-selected={index === 0}
            tabIndex={index === 0 ? 0 : -1}
            variant="outline"
            className={cn(TAB_CLASS, index === 0 && SELECTED_TAB_CLASS)}
          >
            {example.question}
          </Button>
        ))}
      </div>
      <div
        role="tabpanel"
        aria-describedby={isSample ? SAMPLE_LABEL_ID : undefined}
        tabIndex={0}
        style={PANEL_STYLE}
        className={PANEL_CLASS}
      >
        <BriefingSkeleton />
      </div>
    </div>
  );
}
