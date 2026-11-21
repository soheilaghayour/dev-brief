import type { Prisma, Summary } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

type StoryRef = { id: string; clusterId: string | null };

// Newest first; the id breaks a tie between two summaries stored in the same millisecond.
const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.SummaryOrderByWithRelationInput[];

/**
 * Where a story's summary lives: on any member of its cluster while clusters are on, otherwise on the story itself.
 * The one rule behind `GET /stories/:id/summary`, story detail, the cluster endpoint and a card's `hasSummary`.
 */
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

/** The newest of summaries already loaded, in the order `findSummary` uses. */
export function newestSummary<Row extends { createdAt: Date; id: string }>(rows: readonly Row[]) {
  return rows.reduce<Row | null>((newest, row) => {
    if (!newest) return row;
    const later =
      row.createdAt.getTime() - newest.createdAt.getTime() || row.id.localeCompare(newest.id);
    return later > 0 ? row : newest;
  }, null);
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
