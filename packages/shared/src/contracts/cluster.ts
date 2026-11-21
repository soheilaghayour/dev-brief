import { z } from 'zod';
import { SourceKindSchema, StoryCardSchema } from './story.js';
import { StorySummarySchema } from './summary.js';

/** A cluster id in request input; Prisma generates cuids, and ids are validated by format (§8.6). */
export const ClusterIdSchema = z.string().cuid();

export const ClusterDetailSchema = z.object({
  id: z.string(),
  representative: StoryCardSchema,
  members: z.array(StoryCardSchema),
  sourceKinds: z.array(SourceKindSchema),
  summary: StorySummarySchema.nullable(),
});
export type ClusterDetail = z.infer<typeof ClusterDetailSchema>;
