import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.js';
import { SourceKindSchema, StoryCardSchema, TagSlugSchema } from './story.js';

/** A comma-separated query value, parsed to a list of at most 20 items. */
const csv = <T extends z.ZodTypeAny>(item: T) =>
  z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(item).max(20))
    .describe('Comma-separated list');

export const FeedQuerySchema = PaginationQuerySchema.extend({
  sort: z.enum(['top', 'latest']).default('top'),
  tags: csv(TagSlugSchema).optional(),
  kinds: csv(SourceKindSchema).optional(),
  sources: csv(z.string().max(64)).optional(),
  q: z.string().trim().min(2).max(100).optional(),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FeedPageSchema = z.object({
  items: z.array(StoryCardSchema),
  nextCursor: z.string().nullable(),
});
export type FeedPage = z.infer<typeof FeedPageSchema>;
