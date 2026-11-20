import { z } from 'zod';
import { TagSlugSchema } from '../contracts/story.js';

const VerdictSchema = z.enum(['mostly_positive', 'mixed', 'mostly_negative']);
const CitedPointSchema = z.object({
  point: z.string().max(180),
  storyIds: z.array(z.string()).max(3),
});

/** The only structure the LLM produces; the server compiles it to A2UI messages. */
export const BriefingPlanSchema = z.object({
  title: z.string().max(80),
  sections: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('takeaways'),
          items: z
            .array(z.object({ text: z.string().max(200), storyIds: z.array(z.string()).max(3) }))
            .min(1)
            .max(5),
        }),
        z.object({
          kind: z.literal('stories'),
          picks: z
            .array(z.object({ storyId: z.string(), note: z.string().max(160) }))
            .min(1)
            .max(4),
        }),
        z.object({
          kind: z.literal('consensus'),
          topic: z.string().max(80),
          verdict: VerdictSchema,
          pros: z.array(CitedPointSchema).max(4),
          cons: z.array(CitedPointSchema).max(4),
        }),
        z.object({
          kind: z.literal('velocity'),
          tags: z.array(TagSlugSchema).min(1).max(4),
          window: z.enum(['7d', '30d']),
          metric: z.enum(['stories', 'engagement']),
        }),
        z.object({ kind: z.literal('tags'), tags: z.array(TagSlugSchema).min(1).max(10) }),
      ]),
    )
    .min(2)
    .max(6),
});
export type BriefingPlan = z.infer<typeof BriefingPlanSchema>;
