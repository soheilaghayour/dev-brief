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
    // A boosted Top page reads the matching stories up to three times, so a source filter is resolved once, up front.
    const sourceStories =
      query.sort === 'top' && boost && query.sources?.length
        ? Prisma.sql`"sourceStories" AS MATERIALIZED (
            SELECT DISTINCT si."storyId" FROM "SourceItem" si JOIN "Source" src ON src."id" = si."sourceId"
            WHERE src."slug" = ANY(${query.sources}::text[]))`
        : undefined;
    const filters = [
      ...(query.sort === 'top'
        ? [Prisma.sql`s."publishedAt" >= ${topWindowStart(new Date())}`]
        : []),
      ...(query.tags?.length ? [Prisma.sql`s."tags" && ${query.tags}::text[]`] : []),
      ...(query.kinds?.length
        ? [sourceExists(Prisma.sql`src."kind"::text = ANY(${query.kinds}::text[])`)]
        : []),
      ...(sourceStories
        ? [Prisma.sql`s."id" IN (SELECT "storyId" FROM "sourceStories")`]
        : query.sources?.length
          ? [sourceExists(Prisma.sql`src."slug" = ANY(${query.sources}::text[])`)]
          : []),
      ...(query.q
        ? [Prisma.sql`s."searchVector" @@ websearch_to_tsquery('english', ${query.q})`]
        : []),
      ...exclusions,
    ];
    const limit = query.limit + 1;
    const pageQuery =
      query.sort === 'latest'
        ? latestPage(filters, keyset, limit)
        : topPage(filters, boost, sourceStories, keyset, limit);
    return this.prisma.$queryRaw<PageRow[]>(pageQuery);
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
 * streams, each read in (rankScore, id) index order between the cursor and the page floor, merged by
 * their effective score.
 */
function topPage(
  filters: Prisma.Sql[],
  boost: Prisma.Sql | undefined,
  sourceStories: Prisma.Sql | undefined,
  keyset: Keyset | undefined,
  limit: number,
) {
  if (!boost) return topStream(filters, 1, keyset, limit);
  const floor = Prisma.sql`(SELECT "rankScore" FROM "pageFloor")`;
  // When fewer than a page match, the first rows are every match and the streams stay unread: they would
  // scan the whole index for a floor of -infinity.
  const matches = Prisma.sql`(SELECT "matches" FROM "pageFloor")`;
  const enoughMatches = Prisma.sql`${matches} >= ${limit}`;
  // IS NOT TRUE is the exact complement of WHERE boost, so the streams split the stories even where the boost is NULL.
  const unboosted = Prisma.sql`${boost} IS NOT TRUE`;
  return Prisma.sql`
    WITH ${Prisma.join(
      [
        ...(sourceStories ? [sourceStories] : []),
        Prisma.sql`"firstRows" AS MATERIALIZED (${firstRows(filters, boost, keyset, limit)})`,
        Prisma.sql`"pageFloor" AS (SELECT count(*) AS "matches", min("rankScore") AS "rankScore" FROM "firstRows")`,
      ],
      ', ',
    )}
    (${topStream([...filters, boost, enoughMatches], FOLLOW_BOOST, keyset, limit, floor)})
    UNION ALL
    (${topStream([...filters, unboosted, enoughMatches], 1, keyset, limit, floor)})
    UNION ALL
    (SELECT "id", "publishedAt", CASE WHEN "boosted" THEN "rankScore" * ${FOLLOW_BOOST}::double precision ELSE "rankScore" END
      FROM "firstRows" WHERE ${matches} < ${limit})
    ORDER BY "sortScore" DESC, "id" DESC LIMIT ${limit}`;
}

/**
 * The first `limit` stories after the cursor, by their own boosted or plain score, in index order. Each
 * scores at least its rankScore, so the lowest rankScore among them is the page floor: no story below it
 * can make the page. Fewer than `limit` rows means these are all the matching stories.
 */
function firstRows(
  filters: Prisma.Sql[],
  boost: Prisma.Sql,
  keyset: Keyset | undefined,
  limit: number,
) {
  const after = keyset
    ? [
        Prisma.sql`s."rankScore" <= ${keyset.sortKey}::double precision`,
        Prisma.sql`CASE WHEN ${boost}
          THEN (${scoreSql(FOLLOW_BOOST)}, s."id") < (${keyset.sortKey}::double precision, ${keyset.id})
          ELSE (s."rankScore", s."id") < (${keyset.sortKey}::double precision, ${keyset.id}) END`,
      ]
    : [];
  return Prisma.sql`
    SELECT s."id", s."publishedAt", s."rankScore", (${boost}) IS TRUE AS "boosted" FROM "Story" s
    ${whereClause([...filters, ...after])}
    ORDER BY s."rankScore" DESC, s."id" DESC LIMIT ${limit}`;
}

/** The first `limit` stories scored rankScore × `factor` after the keyset, down to the floor, in index order. */
function topStream(
  conditions: Prisma.Sql[],
  factor: number,
  keyset: Keyset | undefined,
  limit: number,
  floor?: Prisma.Sql,
) {
  const score = scoreSql(factor);
  return Prisma.sql`
    SELECT s."id", s."publishedAt", ${score} AS "sortScore" FROM "Story" s
    ${whereClause([
      ...conditions,
      ...(keyset ? topKeyset(factor, keyset) : []),
      ...(floor ? [atOrAboveFloor(factor, floor)] : []),
    ])}
    ORDER BY s."rankScore" DESC, s."id" DESC LIMIT ${limit}`;
}

function scoreSql(factor: number) {
  return factor === 1
    ? Prisma.sql`s."rankScore"`
    : Prisma.sql`(s."rankScore" * ${factor}::double precision)`;
}

// Index bounds divide a score by the boost; this slack covers the float rounding, so they never cut a row.
const ROUNDING_SLACK = 4 * Number.EPSILON;

// The order ends with id desc, so a row-wise comparison continues exactly after the cursor row.
function topKeyset(factor: number, { sortKey, id }: Keyset) {
  const after = Prisma.sql`(${scoreSql(factor)}, s."id") < (${sortKey}::double precision, ${id})`;
  if (factor === 1) return [after];
  // An index bound for the boosted stream, so its scan starts at the cursor; `after` stays exact.
  return [
    after,
    Prisma.sql`s."rankScore" <= ${sortKey}::double precision / ${factor}::double precision
      * ${1 + ROUNDING_SLACK}::double precision`,
  ];
}

function atOrAboveFloor(factor: number, floor: Prisma.Sql) {
  if (factor === 1) return Prisma.sql`s."rankScore" >= ${floor}`;
  return Prisma.sql`s."rankScore" >= ${floor} / ${factor}::double precision
    * ${1 - ROUNDING_SLACK}::double precision`;
}
