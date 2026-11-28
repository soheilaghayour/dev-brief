import { z } from 'zod';
import { FeedQuerySchema } from './feed.js';
import { TagSlugSchema } from './story.js';

/** The feed's query minus what the counts ignore: the selected tags, the page, and the boosts, which only reorder. */
export const TagListQuerySchema = FeedQuerySchema.omit({
  tags: true,
  cursor: true,
  limit: true,
  boostTags: true,
  boostSources: true,
});
export type TagListQuery = z.infer<typeof TagListQuerySchema>;

export const TagListSchema = z.object({
  version: z.number().int(),
  tags: z.array(z.object({ slug: TagSlugSchema, label: z.string(), count: z.number().int() })),
});
export type TagList = z.infer<typeof TagListSchema>;
