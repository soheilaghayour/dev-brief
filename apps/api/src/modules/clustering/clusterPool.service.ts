import { Injectable } from '@nestjs/common';
import type { ClusterPoolRow } from '@devbrief/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { TITLE_DEDUP_WINDOW_MS } from '../ingestion/ingestionRules.js';

export type ClusterWindowRow = ClusterPoolRow & {
  domain: string;
  excerpt: string | null;
};

/** The stories around a new story, scored against its title by Postgres. */
@Injectable()
export class ClusterPoolService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every story within ±72 h of `story` except `excluded` ones, with its cluster's size and `pg_trgm`
   * similarity of the normalised titles. `excluded` holds the new stories not yet decided, so a story
   * can only match one that was decided before it.
   */
  windowOf(
    story: { id: string; normalizedTitle: string; publishedAt: Date },
    excluded: readonly string[],
  ) {
    const from = new Date(story.publishedAt.getTime() - TITLE_DEDUP_WINDOW_MS);
    const to = new Date(story.publishedAt.getTime() + TITLE_DEDUP_WINDOW_MS);
    // Prisma can't express similarity(), so this is a parameterised raw query.
    return this.prisma.$queryRaw<ClusterWindowRow[]>(Prisma.sql`
      SELECT s."id", s."clusterId", c."memberCount" AS "clusterMemberCount",
             s."title", s."url", s."domain", s."excerpt", s."publishedAt",
             similarity(${story.normalizedTitle}, s."normalizedTitle")::float8 AS "trgm"
      FROM "Story" s
      LEFT JOIN "Cluster" c ON c."id" = s."clusterId"
      WHERE s."publishedAt" BETWEEN ${from} AND ${to}
        AND s."id" <> ALL(${[story.id, ...excluded]}::text[])
    `);
  }
}
