import type { StoryCard } from '@devbrief/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import { summarizedClusterIds } from './clusterSummary.js';
import {
  toSourceRef,
  toStoryCard,
  type CardCluster,
  type StoryFeatures,
  type StoryWithItems,
} from './storyCard.mapper.js';

/** Loads the cluster info of every clustered story in one query; empty while the clusters flag is off. */
async function loadCardClusters(
  prisma: PrismaService,
  stories: readonly StoryWithItems[],
  features: StoryFeatures,
) {
  const clusters = new Map<string, CardCluster>();
  const ids = [...new Set(stories.flatMap((story) => story.clusterId ?? []))];
  if (!features.clusters || ids.length === 0) return clusters;
  const rows = await prisma.cluster.findMany({
    where: { id: { in: ids } },
    select: { id: true, stories: { select: { items: { include: { source: true } } } } },
  });
  for (const row of rows) {
    // A cluster of one story is no cluster: such a card carries no `cluster`.
    if (row.stories.length < 2) continue;
    // The combined source line: every member's items, most engaged first.
    const items = row.stories
      .flatMap((member) => member.items)
      .sort((a, b) => b.engagement - a.engagement || a.id.localeCompare(b.id));
    clusters.set(row.id, {
      id: row.id,
      memberCount: row.stories.length,
      sources: items.map(toSourceRef),
    });
  }
  return clusters;
}

/** Maps stories to cards, adding each clustered story's `cluster` when the flag is on; `knownSummarized` spares the summary query when the caller already asked it. */
export async function toStoryCards(
  prisma: PrismaService,
  stories: readonly StoryWithItems[],
  features: StoryFeatures,
  knownSummarized?: ReadonlySet<string>,
): Promise<StoryCard[]> {
  const clusters = await loadCardClusters(prisma, stories, features);
  // A card says it has a summary when any member of its cluster does.
  const summarized =
    knownSummarized ??
    (features.summaries && features.clusters
      ? await summarizedClusterIds(prisma, [
          ...new Set(stories.flatMap((story) => story.clusterId ?? [])),
        ])
      : undefined);
  return stories.map((story) => toStoryCard(story, features, clusters, summarized));
}
