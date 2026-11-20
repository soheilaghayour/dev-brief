import { Injectable } from '@nestjs/common';
import {
  encodeCursor,
  FOLLOW_BOOST,
  topWindowStart,
  type FeedPage,
  type FeedQuery,
} from '@devbrief/shared';
import { CACHE_TTL_MS, LruCache } from '../../common/cache/lru.cache.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { storyWithItems, toStoryCard } from '../../common/story-card/storyCard.mapper.js';
import { Prisma } from '../../generated/prisma/client.js';
import { effectiveFeedQuery, feedCacheKey, parseKeyset, type Keyset } from './feedQuery.js';

/** `sortScore` is Top's sort key: rankScore with the follow boost applied. */
type PageRow = { id: string; publishedAt: Date; sortScore: number };

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LruCache,
  ) {}

  async getPage(requested: FeedQuery): Promise<FeedPage> {
    const query = effectiveFeedQuery(requested);
    // Parsed before the cache lookup so a bad cursor is always a 400.
    const keyset = query.cursor ? parseKeyset(query.cursor, query.sort) : undefined;
    const cacheKey = feedCacheKey(query);
    const cached = this.cache.get<FeedPage>(cacheKey);
    if (cached) return cached;

    const rows = await this.selectPage(query, keyset);
    const pageRows = rows.slice(0, query.limit);
    const lastRow = pageRows.at(-1);
    const page: FeedPage = {
      items: await this.loadCards(pageRows.map((row) => row.id)),
      nextCursor:
        rows.length > query.limit && lastRow
          ? encodeCursor(
              query.sort,
              query.sort === 'top' ? lastRow.sortScore : lastRow.publishedAt.toISOString(),
              lastRow.id,
            )
          : null,
    };
    this.cache.set(cacheKey, page, CACHE_TTL_MS);
    return page;
  }

  /** The only raw SQL read: filters, full-text search, personalisation and the keyset, all as bound parameters. */
  private selectPage(query: FeedQuery, keyset: Keyset | undefined) {
    const { exclusions, boost } = personalisation(query);
    const filters = [
      ...(query.sort === 'top'
        ? [Prisma.sql`s."publishedAt" >= ${topWindowStart(new Date())}`]
        : []),
      ...(query.tags?.length ? [Prisma.sql`s."tags" && ${query.tags}::text[]`] : []),
      ...(query.kinds?.length
        ? [sourceExists(Prisma.sql`src."kind"::text = ANY(${query.kinds}::text[])`)]
        : []),
      ...(query.sources?.length
        ? [sourceExists(Prisma.sql`src."slug" = ANY(${query.sources}::text[])`)]
        : []),
      ...(query.q
        ? [Prisma.sql`s."searchVector" @@ websearch_to_tsquery('english', ${query.q})`]
        : []),
      ...exclusions,
    ];
    const limit = query.limit + 1;
    const page =
      query.sort === 'latest'
        ? latestPage(filters, keyset, limit)
        : topPage(filters, boost, keyset, limit);
    return this.prisma.$queryRaw<PageRow[]>(page);
  }

  private async loadCards(ids: string[]) {
    const stories = await this.prisma.story.findMany({
      where: { id: { in: ids } },
      include: storyWithItems,
    });
    const storyById = new Map(stories.map((story) => [story.id, story]));
    return ids.flatMap((id) => {
      const story = storyById.get(id);
      return story ? [toStoryCard(story)] : [];
    });
  }
}

function whereClause(conditions: Prisma.Sql[]) {
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

function sourceExists(sourceCondition: Prisma.Sql) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "SourceItem" si JOIN "Source" src ON src."id" = si."sourceId"
    WHERE si."storyId" = s."id" AND ${sourceCondition})`;
}

/** Mutes and follows, applied per story: the one place a cluster-level rule would replace. */
function personalisation(query: FeedQuery) {
  const { excludeTags, excludeSources, boostTags, boostSources } = query;
  const exclusions = [
    // IS NOT TRUE, not NOT: a story with NULL tags matches no tag, so no tag mute hides it.
    ...(excludeTags?.length ? [Prisma.sql`(s."tags" && ${excludeTags}::text[]) IS NOT TRUE`] : []),
    // A muted source hides a story only when every one of its sources is muted.
    ...(excludeSources?.length
      ? [sourceExists(Prisma.sql`src."slug" <> ALL(${excludeSources}::text[])`)]
      : []),
  ];
  const follows = [
    ...(boostTags?.length ? [Prisma.sql`s."tags" && ${boostTags}::text[]`] : []),
    ...(boostSources?.length
      ? [sourceExists(Prisma.sql`src."slug" = ANY(${boostSources}::text[])`)]
      : []),
  ];
  // One multiplier however many follows match.
  const boost = follows.length ? Prisma.sql`(${Prisma.join(follows, ' OR ')})` : undefined;
  return { exclusions, boost };
}

function latestPage(filters: Prisma.Sql[], keyset: Keyset | undefined, limit: number) {
  const after = keyset
    ? [Prisma.sql`(s."publishedAt", s."id") < (${keyset.sortKey}, ${keyset.id})`]
    : [];
  return Prisma.sql`
    SELECT s."id", s."publishedAt", s."rankScore" AS "sortScore" FROM "Story" s
    ${whereClause([...filters, ...after])} ORDER BY s."publishedAt" DESC, s."id" DESC LIMIT ${limit}`;
}

/**
 * Top, ordered by rankScore with the follow boost applied: boosted and unboosted stories are two
 * streams, each read in (rankScore, id) index order, merged by their effective score.
 */
function topPage(
  filters: Prisma.Sql[],
  boost: Prisma.Sql | undefined,
  keyset: Keyset | undefined,
  limit: number,
) {
  if (!boost) return topStream(filters, 1, keyset, limit);
  // IS NOT TRUE, not NOT: a story with NULL tags makes the boost NULL, and it counts as unboosted.
  return Prisma.sql`
    (${topStream([...filters, boost], FOLLOW_BOOST, keyset, limit)})
    UNION ALL
    (${topStream([...filters, Prisma.sql`${boost} IS NOT TRUE`], 1, keyset, limit)})
    ORDER BY "sortScore" DESC, "id" DESC LIMIT ${limit}`;
}

/** The first `limit` stories after the keyset whose score is rankScore × `factor`, in index order. */
function topStream(
  conditions: Prisma.Sql[],
  factor: number,
  keyset: Keyset | undefined,
  limit: number,
) {
  const score =
    factor === 1
      ? Prisma.sql`s."rankScore"`
      : Prisma.sql`(s."rankScore" * ${factor}::double precision)`;
  return Prisma.sql`
    SELECT s."id", s."publishedAt", ${score} AS "sortScore" FROM "Story" s
    ${whereClause([...conditions, ...(keyset ? topKeyset(score, factor, keyset) : [])])}
    ORDER BY s."rankScore" DESC, s."id" DESC LIMIT ${limit}`;
}

// The order ends with id desc, so a row-wise comparison continues exactly after the cursor row.
function topKeyset(score: Prisma.Sql, factor: number, { sortKey, id }: Keyset) {
  const after = Prisma.sql`(${score}, s."id") < (${sortKey}::double precision, ${id})`;
  if (factor === 1) return [after];
  // An index bound for the boosted stream: its slack covers float rounding, and `after` stays exact.
  return [
    after,
    Prisma.sql`s."rankScore" <= ${sortKey}::double precision / ${factor}::double precision
      * ${1 + 4 * Number.EPSILON}::double precision`,
  ];
}
