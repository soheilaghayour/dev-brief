import { Injectable } from '@nestjs/common';
import { clusterProfile, type ClusterPoolRow } from '@devbrief/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { TITLE_DEDUP_WINDOW_MS } from '../ingestion/ingestionRules.js';
import type { ClusterJoinResult } from './clusterMembership.service.js';

export type ClusterWindowRow = ClusterPoolRow & {
  domain: string;
  excerpt: string | null;
  normalizedTitle: string;
};

/** The stories around a run's new stories, held in memory and kept current as decisions are written. */
export class ClusterPool {
  private readonly rows: Map<string, ClusterWindowRow>;
  private readonly undecided: Set<string>;

  constructor(rows: readonly ClusterWindowRow[], undecided: readonly string[]) {
    this.rows = new Map(rows.map((row) => [row.id, row]));
    this.undecided = new Set(undecided);
  }

  /** Every decided story within ±72 h of `story`, so a story can only match one decided before it. */
  windowOf(story: { id: string; publishedAt: Date }) {
    const from = story.publishedAt.getTime() - TITLE_DEDUP_WINDOW_MS;
    const to = story.publishedAt.getTime() + TITLE_DEDUP_WINDOW_MS;
    const window: ClusterWindowRow[] = [];
    for (const row of this.rows.values()) {
      const published = row.publishedAt.getTime();
      if (published >= from && published <= to && !this.undecided.has(row.id)) window.push(row);
    }
    return window;
  }

  markDecided(storyId: string) {
    this.undecided.delete(storyId);
  }

  /** Mirrors a written decision: the story and its partner now stand in `result.cluster`, whose size changed. */
  applyJoin(storyId: string, partnerId: string, { joined, cluster }: ClusterJoinResult) {
    if (!cluster) return;
    for (const row of this.rows.values()) {
      if (row.clusterId === cluster.id) row.clusterMemberCount = cluster.memberCount;
    }
    for (const id of joined ? [storyId, partnerId] : [partnerId]) {
      const row = this.rows.get(id);
      if (row)
        Object.assign(row, { clusterId: cluster.id, clusterMemberCount: cluster.memberCount });
    }
  }
}

/** Loads the pool of a run once, so scoring a new story needs no query. */
@Injectable()
export class ClusterPoolService {
  constructor(private readonly prisma: PrismaService) {}

  /** The stories first seen at or after `startedAt`, oldest `publishedAt` first, and the pool of stories within ±72 h of them. */
  async load(startedAt: Date) {
    // Stories first seen before this run were decided (or not) in the run that created them.
    const createdIds = await this.prisma.story.findMany({
      where: { firstSeenAt: { gte: startedAt } },
      select: { id: true, publishedAt: true },
      orderBy: [{ publishedAt: 'asc' }, { id: 'asc' }],
    });
    const [first, last] = [createdIds[0], createdIds.at(-1)];
    if (!first || !last) return { created: [], pool: new ClusterPool([], []) };
    const stories = await this.prisma.story.findMany({
      where: {
        publishedAt: {
          gte: new Date(first.publishedAt.getTime() - TITLE_DEDUP_WINDOW_MS),
          lte: new Date(last.publishedAt.getTime() + TITLE_DEDUP_WINDOW_MS),
        },
      },
      select: {
        id: true,
        title: true,
        url: true,
        domain: true,
        excerpt: true,
        normalizedTitle: true,
        publishedAt: true,
        clusterId: true,
        cluster: { select: { memberCount: true } },
      },
    });
    const rows = new Map(
      stories.map(({ cluster, ...story }) => [
        story.id,
        {
          ...story,
          profile: clusterProfile(story),
          clusterMemberCount: cluster?.memberCount ?? null,
        },
      ]),
    );
    const created = createdIds.flatMap(({ id }) => rows.get(id) ?? []);
    return {
      created,
      pool: new ClusterPool(
        [...rows.values()],
        createdIds.map(({ id }) => id),
      ),
    };
  }
}
