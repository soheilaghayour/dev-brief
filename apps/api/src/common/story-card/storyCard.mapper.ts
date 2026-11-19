import { TAG_SLUGS, type SourceRef, type StoryCard, type TagSlug } from '@devbrief/shared';
import type { Prisma } from '../../generated/prisma/client.js';

/** The Prisma include every story read uses, so the mapper below sees the same shape everywhere. */
export const storyWithItems = {
  items: {
    include: { source: true },
    orderBy: [{ engagement: 'desc' }, { id: 'asc' }],
  },
} satisfies Prisma.StoryInclude;

export type StoryWithItems = Prisma.StoryGetPayload<{ include: typeof storyWithItems }>;
type ItemWithSource = StoryWithItems['items'][number];

// A slug retired by a taxonomy bump is dropped, so old stories never fail the client's parse.
const TAG_SLUG_SET: ReadonlySet<string> = new Set(TAG_SLUGS);
const isTagSlug = (tag: string): tag is TagSlug => TAG_SLUG_SET.has(tag);

export function toSourceRef(item: ItemWithSource): SourceRef {
  return {
    kind: item.source.kind,
    slug: item.source.slug,
    name: item.source.name,
    itemUrl: item.discussionUrl ?? item.url,
    points: item.points,
    comments: item.commentsCount,
    reactions: item.reactionsCount,
  };
}

export function toStoryCard(story: StoryWithItems): StoryCard {
  return {
    id: story.id,
    title: story.title,
    url: story.url,
    domain: story.domain,
    excerpt: story.excerpt,
    author: story.author,
    publishedAt: story.publishedAt.toISOString(),
    tags: story.tags.filter(isTagSlug),
    readingTimeMinutes: story.readingTimeMinutes,
    sources: story.items.map(toSourceRef),
    rankScore: story.rankScore,
  };
}
