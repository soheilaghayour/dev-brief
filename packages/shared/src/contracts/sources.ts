import { z } from 'zod';
import { FEED_SOURCE_SLUG_MAX } from './feedLimits.js';
import { SourceKindSchema } from './story.js';

/** A source slug checked by format only, so a source removed later never invalidates stored preferences. */
export const SourceSlugSchema = z
  .string()
  .max(FEED_SOURCE_SLUG_MAX)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'A source slug is lowercase words joined by hyphens');

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
