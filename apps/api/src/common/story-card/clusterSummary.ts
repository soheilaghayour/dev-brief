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

/** What a card says of its cluster's summary: the first TL;DR point of the newest one, and whether the members hold enough to summarise. */
export type ClusterSummaryInfo = { line: string | null; canSummarize: boolean };

/** The summary info of each cluster in `canSummarize`, whose entries the caller judged from the members it already loaded; one query for the whole page. */
export async function loadClusterSummaryInfo(
  prisma: Pick<PrismaService, 'summary'>,
  canSummarize: ReadonlyMap<string, boolean>,
) {
  const infos = new Map<string, ClusterSummaryInfo>();
  if (canSummarize.size === 0) return infos;
  const summaries = await prisma.summary.findMany({
    where: { story: { clusterId: { in: [...canSummarize.keys()] } } },
    orderBy: NEWEST_FIRST,
    select: { tldr: true, story: { select: { clusterId: true } } },
  });
  // Newest first, so the first summary seen of a cluster is its newest.
  const lines = new Map<string, string | undefined>();
  for (const { story, tldr } of summaries) {
    if (story.clusterId && !lines.has(story.clusterId)) lines.set(story.clusterId, tldr[0]);
  }
  for (const [clusterId, can] of canSummarize) {
    infos.set(clusterId, { line: lines.get(clusterId) ?? null, canSummarize: can });
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
