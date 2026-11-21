import type { Prisma, Summary } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

type StoryRef = { id: string; clusterId: string | null };

// Newest first; the id breaks a tie between two summaries stored in the same millisecond.
const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.SummaryOrderByWithRelationInput[];

/** Where a story's summary lives: on any member of its cluster while clusters are on, otherwise on the story itself. */
export function summaryWhere(story: StoryRef, clustersOn: boolean): Prisma.SummaryWhereInput {
  return clustersOn && story.clusterId
    ? { story: { clusterId: story.clusterId } }
    : { storyId: story.id };
}

/** The newest summary among the story's cluster members, or the story's own when it is single; null when there is none. */
export function findSummary(
  prisma: Pick<PrismaService, 'summary'>,
  story: StoryRef,
  clustersOn: boolean,
): Promise<Summary | null> {
  return prisma.summary.findFirst({
    where: summaryWhere(story, clustersOn),
    orderBy: NEWEST_FIRST,
  });
}

/** The ids, among `clusterIds`, of clusters where some member has a summary; one query. */
export async function summarizedClusterIds(
  prisma: Pick<PrismaService, 'summary'>,
  clusterIds: readonly string[],
) {
  if (clusterIds.length === 0) return new Set<string>();
  const rows = await prisma.summary.findMany({
    where: { story: { clusterId: { in: [...clusterIds] } } },
    select: { story: { select: { clusterId: true } } },
  });
  return new Set(rows.flatMap((row) => row.story.clusterId ?? []));
}

/** The kind and comment count of every item of the story, or of all members of its cluster while clusters are on; what `hasSummaryInput` judges. */
export function loadSummaryInputItems(
  prisma: Pick<PrismaService, 'sourceItem'>,
  story: StoryRef,
  clustersOn: boolean,
) {
  return prisma.sourceItem.findMany({
    where: {
      story: clustersOn && story.clusterId ? { clusterId: story.clusterId } : { id: story.id },
    },
    select: { commentsCount: true, source: { select: { kind: true } } },
  });
}
