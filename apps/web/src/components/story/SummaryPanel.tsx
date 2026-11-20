import type { StorySummary } from '@devbrief/shared';
import { SummarizeButton } from './SummarizeButton';
import { SummaryView } from './SummaryView';

/** The story's summary when it has one, otherwise the button that asks for it. */
export function SummaryPanel({
  storyId,
  summary,
  autoStart = false,
}: {
  storyId: string;
  summary: StorySummary | null;
  /** Starts the request once on load, for `?summarize=1`. */
  autoStart?: boolean;
}) {
  if (summary) return <SummaryView summary={summary} />;
  return <SummarizeButton storyId={storyId} autoStart={autoStart} />;
}
