import type { Prisma, Summary } from '../../generated/prisma/client.js';
import { hasSummaryInput } from '../summary-input/hasSummaryInput.js';
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

/** What a card says of its cluster's summary: the first TL;DR point of the newest one, and whether the members hold enough to summarise. */
export type ClusterSummaryInfo = { line: string | null; canSummarize: boolean };

/** The summary info of each cluster in `clusterIds`; two queries for the whole page. */
export async function loadClusterSummaryInfo(
  prisma: Pick<PrismaService, 'summary' | 'sourceItem'>,
  clusterIds: readonly string[],
) {
  const infos = new Map<string, ClusterSummaryInfo>();
  if (clusterIds.length === 0) return infos;
  const inCluster = { clusterId: { in: [...clusterIds] } };
  const [summaries, items] = await Promise.all([
    prisma.summary.findMany({
      where: { story: inCluster },
      orderBy: NEWEST_FIRST,
      select: { tldr: true, story: { select: { clusterId: true } } },
    }),
    prisma.sourceItem.findMany({
      where: { story: inCluster },
      select: {
        commentsCount: true,
        source: { select: { kind: true } },
        story: { select: { clusterId: true } },
      },
    }),
  ]);
  for (const clusterId of clusterIds) {
    const line = summaries.find((row) => row.story.clusterId === clusterId)?.tldr[0] ?? null;
    const members = items.filter((item) => item.story.clusterId === clusterId);
    infos.set(clusterId, { line, canSummarize: hasSummaryInput({ items: members }) });
  }
  return infos;
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
