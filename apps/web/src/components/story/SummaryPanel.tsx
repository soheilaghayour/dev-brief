import type { StorySummary } from '@devbrief/shared';
import { SummarizeButton } from './SummarizeButton';
import { SummaryView } from './SummaryView';

/** The story's summary when it has one, otherwise the button that asks for it, or nothing when the story has too little to summarise. */
export function SummaryPanel({
  storyId,
  summary,
  canSummarize,
  autoStart = false,
}: {
  storyId: string;
  summary: StorySummary | null;
  /** `StoryDetail.canSummarize`: the server's answer to whether the story has enough to summarise. */
  canSummarize: boolean;
  /** Starts the request once on load, for `?summarize=1`. */
  autoStart?: boolean;
}) {
  if (summary) return <SummaryView summary={summary} />;
  if (!canSummarize) return null;
  return <SummarizeButton storyId={storyId} autoStart={autoStart} />;
}
