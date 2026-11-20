import { z } from 'zod';

export const StorySummarySchema = z.object({
  storyId: z.string(),
  tldr: z.array(z.string().max(220)).length(3),
  consensus: z
    .object({
      verdict: z.enum(['mostly_positive', 'mixed', 'mostly_negative']),
      pros: z.array(z.string().max(180)).max(3),
      cons: z.array(z.string().max(180)).max(3),
      basedOnComments: z.number().int(),
    })
    .nullable(),
  model: z.string(),
  createdAt: z.string().datetime(),
});
export type StorySummary = z.infer<typeof StorySummarySchema>;

export const SummaryRequestSchema = z.object({ deviceId: z.string().uuid().optional() });
export type SummaryRequest = z.infer<typeof SummaryRequestSchema>;
