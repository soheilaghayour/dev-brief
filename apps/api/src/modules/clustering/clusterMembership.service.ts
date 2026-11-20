import { Injectable } from '@nestjs/common';
import { CLUSTER_MAX_SIZE } from '@devbrief/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Prisma, SourceKind } from '../../generated/prisma/client.js';

export type ClusterOutcome =
  | { kind: 'single'; clusterScore: number | null }
  | { kind: 'join'; clusterScore: number; target: { id: string; clusterId: string | null } };

/** Writes a clustering decision: the only place that changes cluster membership. */
@Injectable()
export class ClusterMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  /** Stores the decision for `storyId` in one transaction; returns whether the story ended up in a cluster. */
  async record(storyId: string, outcome: ClusterOutcome) {
    return this.prisma.$transaction(async (tx) => {
      if (outcome.kind === 'single') {
        await tx.story.update({
          where: { id: storyId },
          data: { clusterScore: outcome.clusterScore },
        });
        return false;
      }
      const joined = await this.join(tx, storyId, outcome);
      // A cluster that filled up since the candidates were loaded keeps S single but remembers the decision.
      if (!joined) {
        await tx.story.update({
          where: { id: storyId },
          data: { clusterScore: outcome.clusterScore },
        });
      }
      return joined;
    });
  }

  private async join(
    tx: Prisma.TransactionClient,
    storyId: string,
    { target, clusterScore }: Extract<ClusterOutcome, { kind: 'join' }>,
  ) {
    const storyKinds = await sourceKindsOf(tx, storyId);
    const memberData = { isPrimary: false, clusterScore };
    if (target.clusterId !== null) {
      const cluster = await tx.cluster.findUniqueOrThrow({ where: { id: target.clusterId } });
      if (cluster.memberCount >= CLUSTER_MAX_SIZE) return false;
      await tx.cluster.update({
        where: { id: cluster.id },
        data: {
          memberCount: { increment: 1 },
          sourceKinds: union(cluster.sourceKinds, storyKinds),
        },
      });
      await tx.story.update({
        where: { id: storyId },
        data: { ...memberData, clusterId: cluster.id },
      });
      return true;
    }
    const partner = await tx.story.findUniqueOrThrow({
      where: { id: target.id },
      select: { id: true, rankScore: true },
    });
    // Until the rank recompute re-picks it, the cluster's representative is the story that was there first.
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
    return true;
  }
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
