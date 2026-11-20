import { Injectable } from '@nestjs/common';
import { CLUSTER_MAX_SIZE } from '@devbrief/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma, SourceKind } from '../../generated/prisma/client.js';

export type ClusterOutcome =
  | { kind: 'single'; clusterScore: number | null }
  | { kind: 'join'; clusterScore: number; target: { id: string } };

/** What a join left behind: whether the story joined, and the cluster the target stands in with its size now. */
export type ClusterJoinResult = {
  joined: boolean;
  cluster: { id: string; memberCount: number } | null;
};

/** Writes a clustering decision: the only place that changes cluster membership. */
@Injectable()
export class ClusterMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores the decision for `storyId` in one transaction. */
  async record(storyId: string, outcome: ClusterOutcome): Promise<ClusterJoinResult> {
    return this.prisma.$transaction(async (tx) => {
      if (outcome.kind === 'single') {
        await tx.story.update({
          where: { id: storyId },
          data: { clusterScore: outcome.clusterScore },
        });
        return { joined: false, cluster: null };
      }
      const result = await this.join(tx, storyId, outcome);
      // A cluster that filled up since the candidates were loaded keeps S single but remembers the decision.
      if (!result.joined) {
        await tx.story.update({
          where: { id: storyId },
          data: { clusterScore: outcome.clusterScore },
        });
      }
      return result;
    });
  }

  private async join(
    tx: Prisma.TransactionClient,
    storyId: string,
    { target, clusterScore }: Extract<ClusterOutcome, { kind: 'join' }>,
  ): Promise<ClusterJoinResult> {
    const storyKinds = await sourceKindsOf(tx, storyId);
    const memberData = { isPrimary: false, clusterScore };
    // The partner may have joined a cluster since the candidates were loaded, so its cluster is read here.
    const partner = await tx.story.findUniqueOrThrow({
      where: { id: target.id },
      select: { id: true, clusterId: true, rankScore: true },
    });
    if (partner.clusterId !== null) {
      // The size check and the increment are one statement, so a cluster can't pass 12.
      const { count } = await tx.cluster.updateMany({
        where: { id: partner.clusterId, memberCount: { lt: CLUSTER_MAX_SIZE } },
        data: { memberCount: { increment: 1 } },
      });
      const cluster = await tx.cluster.findUniqueOrThrow({ where: { id: partner.clusterId } });
      if (count === 0) return { joined: false, cluster: summaryOf(cluster) };
      await tx.cluster.update({
        where: { id: cluster.id },
        data: { sourceKinds: union(cluster.sourceKinds, storyKinds) },
      });
      await tx.story.update({
        where: { id: storyId },
        data: { ...memberData, clusterId: cluster.id },
      });
      return { joined: true, cluster: summaryOf(cluster) };
    }
    // The cluster feed's rank upkeep re-picks the representative; until it runs, it is the story that was there first.
    const cluster = await tx.cluster.create({
      data: {
        representativeStoryId: partner.id,
        memberCount: 2,
        sourceKinds: union(await sourceKindsOf(tx, partner.id), storyKinds),
        rankScore: partner.rankScore,
      },
    });
    await tx.story.update({ where: { id: partner.id }, data: { clusterId: cluster.id } });
    await tx.story.update({
      where: { id: storyId },
      data: { ...memberData, clusterId: cluster.id },
    });
    return { joined: true, cluster: summaryOf(cluster) };
  }
}

function summaryOf({ id, memberCount }: { id: string; memberCount: number }) {
  return { id, memberCount };
}

async function sourceKindsOf(tx: Prisma.TransactionClient, storyId: string) {
  const items = await tx.sourceItem.findMany({
    where: { storyId },
    select: { source: { select: { kind: true } } },
  });
  return items.map(({ source }) => source.kind);
}

function union(a: readonly SourceKind[], b: readonly SourceKind[]) {
  return [...new Set([...a, ...b])];
}
