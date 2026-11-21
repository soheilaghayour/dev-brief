import type { StorySummary } from '@devbrief/shared';
import { SummarizeButton } from './SummarizeButton';
import { SummaryView, type SummaryOrigin } from './SummaryView';

/** The story's summary when it has one, otherwise the button that asks for it, or nothing when the story has too little to summarise. */
export function SummaryPanel({
  storyId,
  summary,
  canSummarize,
  origin,
  autoStart = false,
}: {
  storyId: string;
  summary: StorySummary | null;
  /** `StoryDetail.canSummarize`: the server's answer to whether the story has enough to summarise. */
  canSummarize: boolean;
  origin: SummaryOrigin;
  /** Starts the request once on load, for `?summarize=1`. */
  autoStart?: boolean;
}) {
  if (summary) return <SummaryView summary={summary} origin={origin} />;
  if (!canSummarize) return null;
  return <SummarizeButton storyId={storyId} origin={origin} autoStart={autoStart} />;
}
