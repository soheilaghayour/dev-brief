import { z } from 'zod';
import { SourceKindSchema } from './story.js';

export const SourceStatusSchema = z.enum(['healthy', 'stale', 'circuit_open']);
export type SourceStatus = z.infer<typeof SourceStatusSchema>;

export const SourceListSchema = z.object({
  sources: z.array(
    z.object({
      slug: z.string(),
      kind: SourceKindSchema,
      name: z.string(),
      siteUrl: z.string().url(),
      status: SourceStatusSchema,
      lastSuccessAt: z.string().datetime().nullable(),
    }),
  ),
});
export type SourceList = z.infer<typeof SourceListSchema>;
