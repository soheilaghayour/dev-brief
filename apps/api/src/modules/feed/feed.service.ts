import { Inject, Injectable } from '@nestjs/common';
import {
  encodeCursor,
  FOLLOW_BOOST,
  type FeedPage,
  type FeedQuery,
  type StoryCard,
} from '@devbrief/shared';
import {
  buildFeedFilters,
  sourceExists,
  whereClause,
} from '../../common/feed-filters/feedFilters.js';
import { CACHE_TTL_MS, LruCache } from '../../common/cache/lru.cache.js';
import { ENV, type Env } from '../../common/env/env.module.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { toStoryCards } from '../../common/story-card/clusterCards.js';
import {
  type StoryFeatures,
  storyFeatures,
  storyWithItems,
} from '../../common/story-card/storyCard.mapper.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  effectiveFeedQuery,
  feedCacheKey,
  parseKeyset,
  questionKeywords,
  type Keyset,
} from './feedQuery.js';

/** Options for in-process callers; the feed contract does not carry them. */
export type FirstPageOptions = {
  /** Match a story holding any keyword of `q` (not all of them), best `ts_rank_cd` first, instead of the feed's every-piece substring match. */
  ftsMode?: 'any';
};

/** `sortScore` is Top's sort key: rankScore with the follow boost applied. */
type PageRow = { id: string; publishedAt: Date; sortScore: number };

@Injectable()
export class FeedService {
  private readonly features: StoryFeatures;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LruCache,
    @Inject(ENV) env: Env,
  ) {
    this.features = storyFeatures(env);
  }

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

  /** The first page of a query read uncached and past the contract's limits (a `q` over 100 characters), for callers that are not an HTTP request. */
  async readFirstPage(requested: FeedQuery, options: FirstPageOptions = {}): Promise<StoryCard[]> {
    const query = effectiveFeedQuery(requested);
    const rows = await this.selectPage(query, undefined, options);
    return this.loadCards(rows.slice(0, query.limit).map((row) => row.id));
  }

  /** The only raw SQL read: filters, search, personalisation and the keyset, all as bound parameters. */
  private async selectPage(
    query: FeedQuery,
    keyset: Keyset | undefined,
    { ftsMode }: FirstPageOptions = {},
  ) {
    const boost = boostCondition(query);
    const keywords = ftsMode === 'any' && query.q ? questionKeywords(query.q) : undefined;
    if (keywords?.length === 0) return [];
    const filters = await buildFeedFilters(this.prisma, query, {
      clusters: this.features.clusters,
      now: new Date(),
      keywords,
    });
    const limit = query.limit + 1;
    const pageQuery = keywords
      ? keywordPage(filters, keywords, limit)
      : query.sort === 'latest'
        ? latestPage(filters, keyset, limit)
        : topPage(filters, boost, keyset, limit);
    return this.prisma.$queryRaw<PageRow[]>(pageQuery);
  }

  private async loadCards(ids: string[]) {
    const stories = await this.prisma.story.findMany({
      where: { id: { in: ids } },
      include: storyWithItems,
    });
    const storyById = new Map(stories.map((story) => [story.id, story]));
    const ordered = ids.flatMap((id) => storyById.get(id) ?? []);
    return toStoryCards(this.prisma, ordered, this.features);
  }
}

/** Follows, applied per story: with clusters on that is the representative's. */
function boostCondition({ boostTags, boostSources }: FeedQuery) {
  const follows = [
    ...(boostTags?.length ? [Prisma.sql`s."tags" && ${boostTags}::text[]`] : []),
    ...(boostSources?.length
      ? [sourceExists(Prisma.sql`src."slug" = ANY(${boostSources}::text[])`)]
      : []),
  ];
  // One multiplier however many follows match.
  return follows.length ? Prisma.sql`(${Prisma.join(follows, ' OR ')})` : undefined;
}

/** The stories holding any keyword, and at least two of them when there are two or more, best `ts_rank_cd` first. */
function keywordPage(filters: Prisma.Sql[], keywords: string[], limit: number) {
  // The keywords are letters and digits only, so they can't add tsquery syntax.
  const anyKeyword = Prisma.sql`to_tsquery('english', ${keywords.join(' | ')})`;
  const matchedKeywords = Prisma.sql`(SELECT count(*) FROM unnest(${keywords}::text[]) AS keyword
    WHERE s."searchVector" @@ plainto_tsquery('english', keyword))`;
  const conditions = [
    ...filters,
    Prisma.sql`s."searchVector" @@ ${anyKeyword}`,
    Prisma.sql`${matchedKeywords} >= ${Math.min(keywords.length, 2)}::int`,
  ];
  return Prisma.sql`
    SELECT s."id", s."publishedAt", s."rankScore" AS "sortScore" FROM "Story" s
    ${whereClause(conditions)}
    ORDER BY ts_rank_cd(s."searchVector", ${anyKeyword}) DESC, s."id" DESC LIMIT ${limit}`;
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
  keyset: Keyset | undefined,
  limit: number,
) {
  if (!boost) return topStream(filters, 1, keyset, limit);
  const floor = Prisma.sql`(SELECT "rankScore" FROM "pageFloor")`;
  // When fewer than a page-plus-one match, the first rows are every match and the streams stay unread: they would
  // scan the whole index for a floor of -infinity.
  const matches = Prisma.sql`(SELECT "matches" FROM "pageFloor")`;
  const enoughMatches = Prisma.sql`${matches} >= ${limit}`;
  // IS NOT TRUE is the exact complement of WHERE boost, so the streams split the stories even where the boost is NULL.
  const unboosted = Prisma.sql`${boost} IS NOT TRUE`;
  return Prisma.sql`
    WITH "firstRows" AS MATERIALIZED (${firstRows(filters, boost, keyset, limit)}),
      "pageFloor" AS (SELECT count(*) AS "matches", min("rankScore") AS "rankScore" FROM "firstRows")
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
