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
import { feedCacheKey, parseKeyset, type Keyset } from './feedQuery.js';

/** `sortScore` is Top's sort key: rankScore with the follow boost applied. */
type PageRow = { id: string; publishedAt: Date; sortScore: number };

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LruCache,
  ) {}

  async getPage(query: FeedQuery): Promise<FeedPage> {
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
    const { exclusions, sortScore } = personalisation(query);
    const conditions = [
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
      ...(keyset ? [keysetCondition(query.sort, keyset, sortScore)] : []),
    ];
    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;
    const orderBy =
      query.sort === 'top'
        ? Prisma.sql`ORDER BY "sortScore" DESC, s."id" DESC`
        : Prisma.sql`ORDER BY s."publishedAt" DESC, s."id" DESC`;
    return this.prisma.$queryRaw<PageRow[]>`
      SELECT s."id", s."publishedAt", ${sortScore} AS "sortScore" FROM "Story" s
      ${where} ${orderBy} LIMIT ${query.limit + 1}`;
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

function sourceExists(sourceCondition: Prisma.Sql) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "SourceItem" si JOIN "Source" src ON src."id" = si."sourceId"
    WHERE si."storyId" = s."id" AND ${sourceCondition})`;
}

/** Mutes and follows, applied per story: the one place a cluster-level rule would replace. */
function personalisation(query: FeedQuery) {
  const { excludeTags, excludeSources, boostTags, boostSources } = query;
  const exclusions = [
    ...(excludeTags?.length ? [Prisma.sql`NOT (s."tags" && ${excludeTags}::text[])`] : []),
    // A muted source hides a story only when every one of its sources is muted.
    ...(excludeSources?.length
      ? [sourceExists(Prisma.sql`src."slug" <> ALL(${excludeSources}::text[])`)]
      : []),
  ];
  const boosts = [
    ...(boostTags?.length ? [Prisma.sql`s."tags" && ${boostTags}::text[]`] : []),
    ...(boostSources?.length
      ? [sourceExists(Prisma.sql`src."slug" = ANY(${boostSources}::text[])`)]
      : []),
  ];
  // Latest ignores rankScore, so it ignores boosts; one multiplier however many follows match.
  const sortScore =
    query.sort === 'top' && boosts.length
      ? Prisma.sql`(s."rankScore" * CASE WHEN ${Prisma.join(boosts, ' OR ')}
          THEN ${FOLLOW_BOOST}::double precision ELSE 1 END)`
      : Prisma.sql`s."rankScore"`;
  return { exclusions, sortScore };
}

// Both sorts end with id desc, so a row-wise comparison continues exactly after the cursor row.
function keysetCondition(sort: FeedQuery['sort'], { sortKey, id }: Keyset, sortScore: Prisma.Sql) {
  return sort === 'top'
    ? Prisma.sql`(${sortScore}, s."id") < (${sortKey}::double precision, ${id})`
    : Prisma.sql`(s."publishedAt", s."id") < (${sortKey}, ${id})`;
}
