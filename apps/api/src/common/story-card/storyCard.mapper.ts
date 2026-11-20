import {
  isTagSlug,
  StorySummarySchema,
  type SourceRef,
  type StoryCard,
  type StorySummary,
} from '@devbrief/shared';
import type { Prisma, Summary } from '../../generated/prisma/client.js';
import type { Env } from '../env/env.module.js';

/** The Prisma include every story read uses, so the mapper below sees the same shape everywhere; a card needs only whether a summary exists. */
export const storyWithItems = {
  items: {
    include: { source: true },
    orderBy: [{ engagement: 'desc' }, { id: 'asc' }],
  },
  summary: { select: { id: true } },
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
    stars: item.stars,
  };
}

/** The phase flags the mappers read; a field behind an off flag is left out, so flag-off responses match Phase 1. */
export type StoryFeatures = { summaries: boolean };

/** The phase flags the story mappers read, from the validated env. */
export function storyFeatures(env: Pick<Env, 'FEATURE_SUMMARIES'>): StoryFeatures {
  return { summaries: env.FEATURE_SUMMARIES };
}

export function toStorySummary(summary: Summary): StorySummary {
  return {
    storyId: summary.storyId,
    tldr: summary.tldr,
    // A Json column is untyped, so the stored consensus is parsed back into its contract shape.
    consensus: StorySummarySchema.shape.consensus.parse(summary.consensus),
    model: summary.model,
    createdAt: summary.createdAt.toISOString(),
  };
}

export function toStoryCard(story: StoryWithItems, features: StoryFeatures): StoryCard {
  return {
    id: story.id,
    title: story.title,
    url: story.url,
    domain: story.domain,
    excerpt: story.excerpt,
    author: story.author,
    publishedAt: story.publishedAt.toISOString(),
    // A slug retired by a taxonomy bump is dropped, so old stories never fail the client's parse.
    tags: story.tags.filter(isTagSlug),
    readingTimeMinutes: story.readingTimeMinutes,
    sources: story.items.map(toSourceRef),
    rankScore: story.rankScore,
    ...(features.summaries && { hasSummary: story.summary !== null }),
  };
}
