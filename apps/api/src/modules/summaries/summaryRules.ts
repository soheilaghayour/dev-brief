import type { StorySummary } from '@devbrief/shared';
import type { StorySummaryLlm } from '../llm/prompts/storySummary.v1.js';

/** PRD F2.3: a summary based on fewer comments has no consensus, whatever the model returned. */
export const MIN_CONSENSUS_COMMENTS = 5;

/** PRD F2.3: auto summaries stop once this many exist for the UTC day. */
export const AUTO_SUMMARIES_PER_DAY = 20;

/** PRD F2.3: only stories with at least this many comments, summed over their items, are summarised automatically. */
export const AUTO_MIN_COMMENTS = 10;

/** The consensus to store: the model's, with the server's comment count, or null when too few comments went in. */
export function storedConsensus(
  consensus: StorySummaryLlm['consensus'],
  basedOnComments: number,
): StorySummary['consensus'] {
  if (consensus === null || basedOnComments < MIN_CONSENSUS_COMMENTS) return null;
  return { ...consensus, basedOnComments };
}

/** The ids of the stories discussed enough for an auto summary, in the given order. */
export function autoCandidateIds(
  stories: readonly { id: string; items: readonly { commentsCount: number | null }[] }[],
) {
  return stories
    .filter(
      (story) =>
        story.items.reduce((sum, item) => sum + (item.commentsCount ?? 0), 0) >= AUTO_MIN_COMMENTS,
    )
    .map((story) => story.id);
}
