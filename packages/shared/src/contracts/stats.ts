import { z } from 'zod';

export const StatsSchema = z.object({
  storiesToday: z.number().int().nonnegative(),
  sourceCount: z.number().int().nonnegative(),
  lastIngestedAt: z.string().datetime().nullable(),
});
export type Stats = z.infer<typeof StatsSchema>;
