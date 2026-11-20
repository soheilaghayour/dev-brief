import { z } from 'zod';
import {
  FEED_LIST_MAX,
  FEED_QUERY_MAX,
  FEED_QUERY_MIN,
  FEED_SORTS,
  FEED_SOURCE_SLUG_MAX,
} from './feedLimits.js';
import { PaginationQuerySchema } from './pagination.js';
import { SourceKindSchema, StoryCardSchema, TagSlugSchema } from './story.js';

/** A comma-separated query value, parsed to a list of at most `FEED_LIST_MAX` items. */
const csv = <T extends z.ZodTypeAny>(item: T) =>
  z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(item).max(FEED_LIST_MAX))
    .describe('Comma-separated list');

// Looser than SourceSlugSchema, as PRD §6.1 types it: an unknown or odd slug just matches nothing.
const sourceSlugParam = z.string().max(FEED_SOURCE_SLUG_MAX);

export const FeedQuerySchema = PaginationQuerySchema.extend({
  sort: z.enum(FEED_SORTS).default('top'),
  tags: csv(TagSlugSchema).optional(),
  kinds: csv(SourceKindSchema).optional(),
  sources: csv(sourceSlugParam).optional(),
  q: z.string().trim().min(FEED_QUERY_MIN).max(FEED_QUERY_MAX).optional(),
  // Personalisation is derived by the client from its preferences, so responses stay public and cacheable.
  excludeTags: csv(TagSlugSchema).optional(),
  excludeSources: csv(sourceSlugParam).optional(),
  boostTags: csv(TagSlugSchema).optional(),
  boostSources: csv(sourceSlugParam).optional(),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FeedPageSchema = z.object({
  items: z.array(StoryCardSchema),
  nextCursor: z.string().nullable(),
});
export type FeedPage = z.infer<typeof FeedPageSchema>;
