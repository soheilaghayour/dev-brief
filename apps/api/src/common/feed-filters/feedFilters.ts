import { foldAsciiCase, splitSearchPieces, topWindowStart, type FeedQuery } from '@devbrief/shared';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/** Above this many source items, a source filter is not resolved to a list of story ids. */
const SMALL_SOURCE_STORIES = 500;

/** The part of a feed query that decides which stories are listed; the tag filter is optional, so counts leave it out. */
export type FeedFilterQuery = Pick<
  FeedQuery,
  'sort' | 'tags' | 'kinds' | 'sources' | 'q' | 'excludeTags' | 'excludeSources'
>;

type FeedFilterContext = {
  clusters: boolean;
  now: Date;
  /** Set when the caller matches `q` itself, so its pieces are not added as filters. */
  keywords?: string[];
};

/** Lists, sorted and deduplicated: the feed treats every list as a set, so cache keys do too. */
export const sortedSet = (values: readonly string[] = []) => [...new Set(values)].sort();

/** The WHERE conditions of a feed query: the one list the feed page and the tag counts both filter by. */
export async function buildFeedFilters(
  prisma: PrismaService,
  query: FeedFilterQuery,
  { clusters, now, keywords }: FeedFilterContext,
) {
  // A small source is better a list of ids than an EXISTS probe: the planner can't size the subquery, and without
  // the list it walks the whole rankScore (Top) or publishedAt (Latest) index looking for the few matches.
  const sourceStoryIds = query.sources?.length
    ? await smallSourceStoryIds(prisma, query.sources)
    : undefined;
  return [
    // A cluster is its representative's one card: members never list on their own.
    ...(clusters ? [Prisma.sql`s."isPrimary" = true`] : []),
    ...(query.sort === 'top' ? [Prisma.sql`s."publishedAt" >= ${topWindowStart(now)}`] : []),
    ...(query.tags?.length ? [Prisma.sql`s."tags" && ${query.tags}::text[]`] : []),
    ...(query.kinds?.length
      ? [sourceExists(Prisma.sql`src."kind"::text = ANY(${query.kinds}::text[])`)]
      : []),
    ...(sourceStoryIds
      ? [Prisma.sql`s."id" = ANY(${sourceStoryIds}::text[])`]
      : query.sources?.length
        ? [sourceExists(Prisma.sql`src."slug" = ANY(${query.sources}::text[])`)]
        : []),
    ...(query.q && !keywords ? splitSearchPieces(query.q).map(pieceMatches) : []),
    ...mutedFilters(query),
  ];
}

export function whereClause(conditions: Prisma.Sql[]) {
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
}

export function sourceExists(sourceCondition: Prisma.Sql) {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM "SourceItem" si JOIN "Source" src ON src."id" = si."sourceId"
    WHERE si."storyId" = s."id" AND ${sourceCondition})`;
}

/**
 * The story ids of the sources when at most SMALL_SOURCE_STORIES items have them, else undefined. The planner
 * can't size a subquery, so an id list is what makes it look the few stories up instead of scanning; a big source
 * stays an EXISTS, which stops after a page in rankScore order.
 */
async function smallSourceStoryIds(prisma: PrismaService, slugs: string[]) {
  const items = await prisma.sourceItem.findMany({
    where: { source: { slug: { in: slugs } } },
    select: { storyId: true },
    take: SMALL_SOURCE_STORIES + 1,
  });
  return items.length > SMALL_SOURCE_STORIES
    ? undefined
    : [...new Set(items.map((item) => item.storyId))];
}

/** A piece occurring in the title or the excerpt: strpos has no pattern syntax, and lower() under COLLATE "C" folds A-Z only, as `foldAsciiCase` does. */
function pieceMatches(piece: string) {
  const folded = foldAsciiCase(piece);
  return Prisma.sql`(strpos(lower(s."title" COLLATE "C"), ${folded}::text) > 0
    OR strpos(lower(s."excerpt" COLLATE "C"), ${folded}::text) > 0)`;
}

/** Mutes, applied per story: with clusters on that is the representative's. */
function mutedFilters({ excludeTags, excludeSources }: FeedFilterQuery) {
  return [
    // IS NOT TRUE, not NOT: a story with NULL tags matches no tag, so no tag mute hides it.
    ...(excludeTags?.length ? [Prisma.sql`(s."tags" && ${excludeTags}::text[]) IS NOT TRUE`] : []),
    // A muted source hides a story only when every one of its sources is muted.
    ...(excludeSources?.length
      ? [sourceExists(Prisma.sql`src."slug" <> ALL(${excludeSources}::text[])`)]
      : []),
  ];
}
