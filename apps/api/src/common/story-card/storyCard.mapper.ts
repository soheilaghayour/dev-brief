import type { SourceRef, StoryCard, TagSlug } from '@devbrief/shared';
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
    // Only the tagger writes tags, and it emits taxonomy slugs; the output check guards drift.
    tags: story.tags as TagSlug[],
    readingTimeMinutes: story.readingTimeMinutes,
    sources: story.items.map(toSourceRef),
    rankScore: story.rankScore,
  };
}
