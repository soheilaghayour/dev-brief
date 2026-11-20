import { z } from 'zod';
import { SourceStatusSchema } from './sources.js';
import { SourceKindSchema } from './story.js';

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.literal('ok'),
  version: z.string(),
  sources: z.array(
    z.object({
      slug: z.string(),
      kind: SourceKindSchema,
      status: SourceStatusSchema,
      lastSuccessAt: z.string().datetime().nullable(),
    }),
  ),
  llm: z.object({
    spentTodayUsd: z.number().nonnegative(),
    capUsd: z.number().nonnegative(),
  }),
});
export type Health = z.infer<typeof HealthSchema>;
