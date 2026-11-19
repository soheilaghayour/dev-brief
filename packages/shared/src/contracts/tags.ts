import { z } from 'zod';
import { TagSlugSchema } from './story.js';

export const TagListSchema = z.object({
  version: z.number().int(),
  tags: z.array(z.object({ slug: TagSlugSchema, label: z.string(), count7d: z.number().int() })),
});
export type TagList = z.infer<typeof TagListSchema>;
