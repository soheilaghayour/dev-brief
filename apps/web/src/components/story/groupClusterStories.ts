import type { SourceKind, StoryCard } from '@devbrief/shared';
import { SOURCE_KIND_ORDER } from '@/components/feed/sourceKinds';

export type ClusterGroup = { kind: SourceKind; stories: StoryCard[] };

/** Groups a cluster's stories by the kind of their main (most engaged) source, in the fixed kind order; empty groups are dropped. */
export function groupClusterStories(stories: StoryCard[]): ClusterGroup[] {
  return SOURCE_KIND_ORDER.map((kind) => ({
    kind,
    stories: stories.filter((story) => story.sources[0]?.kind === kind),
  })).filter((group) => group.stories.length > 0);
}
