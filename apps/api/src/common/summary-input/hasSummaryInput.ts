/** PRD F2.3: fewer HN and Dev.to comments than this, and no Dev.to article, leave too little to summarise. */
export const SUMMARY_MIN_COMMENTS = 3;

export type SummaryInputItem = { commentsCount: number | null; source: { kind: string } };

/** Whether the story has something to summarise: a Dev.to article, whose body is fetched at summary time, or enough HN and Dev.to comments; `items` are every item of the story, or of all members of its cluster. */
export function hasSummaryInput(story: { items: readonly SummaryInputItem[] }) {
  if (story.items.some((item) => item.source.kind === 'devto')) return true;
  const comments = story.items
    .filter((item) => item.source.kind === 'hn')
    .reduce((sum, item) => sum + (item.commentsCount ?? 0), 0);
  return comments >= SUMMARY_MIN_COMMENTS;
}
