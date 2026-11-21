import { z } from 'zod';
import { TagSlugSchema } from './story.js';

export const RADAR_WINDOWS = ['7d', '30d'] as const;
export const RADAR_METRICS = ['stories', 'engagement'] as const;
export const RADAR_TAGS_MAX = 5;

export const RadarWindowSchema = z.enum(RADAR_WINDOWS);
export type RadarWindow = z.infer<typeof RadarWindowSchema>;
export const RadarMetricSchema = z.enum(RADAR_METRICS);
export type RadarMetric = z.infer<typeof RadarMetricSchema>;

/** A comma-separated query value, parsed to at most `RADAR_TAGS_MAX` distinct tag slugs; an empty list means no `tags` at all. */
const tagsCsv = z
  .string()
  .transform((value) => [...new Set(value.split(',').filter(Boolean))])
  .pipe(z.array(TagSlugSchema).max(RADAR_TAGS_MAX))
  .transform((tags) => (tags.length > 0 ? tags : undefined))
  .describe('Comma-separated list');

export const RadarQuerySchema = z.object({
  window: RadarWindowSchema.default('7d'),
  metric: RadarMetricSchema.default('stories'),
  tags: tagsCsv.optional(),
});
export type RadarQuery = z.infer<typeof RadarQuerySchema>;

export const RadarSchema = z.object({
  window: RadarWindowSchema,
  metric: RadarMetricSchema,
  series: z.array(
    z.object({
      tag: TagSlugSchema,
      label: z.string(),
      points: z.array(z.object({ date: z.string().date(), value: z.number().int() })),
    }),
  ),
  movers: z.array(
    z.object({
      tag: TagSlugSchema,
      label: z.string(),
      current: z.number().int(),
      previous: z.number().int(),
      // null ("new") when the previous window is 0.
      deltaPct: z.number().int().nullable(),
    }),
  ),
});
export type Radar = z.infer<typeof RadarSchema>;
