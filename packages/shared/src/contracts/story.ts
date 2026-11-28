import { z } from 'zod';
import { SOURCE_KINDS } from '../core/ranking.js';
import { TAG_SLUGS } from '../core/taxonomy.js';
import { StorySummarySchema } from './summary.js';

export const SourceKindSchema = z.enum(SOURCE_KINDS);
export const TagSlugSchema = z.enum(TAG_SLUGS);

/** A story id in request input; Prisma generates cuids, and ids are validated by format (§8.6). */
export const StoryIdSchema = z.string().cuid();

export const SourceRefSchema = z.object({
  kind: SourceKindSchema,
  slug: z.string(),
  name: z.string(),
  itemUrl: z.string().url(),
  points: z.number().int().nullable(),
  comments: z.number().int().nullable(),
  reactions: z.number().int().nullable(),
  stars: z.number().int().nullable(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const StoryCardSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  domain: z.string(),
  excerpt: z.string().nullable(),
  author: z.string().nullable(),
  publishedAt: z.string().datetime(),
  tags: z.array(TagSlugSchema),
  readingTimeMinutes: z.number().int().nullable(),
  sources: z.array(SourceRefSchema).min(1),
  rankScore: z.number(),
  // Absent while FEATURE_CLUSTERS is off, so flag-off responses match Phase 1.
  cluster: z
    .object({
      id: z.string(),
      memberCount: z.number().int().min(2),
      sources: z.array(SourceRefSchema),
    })
    .nullable()
    .optional(),
  // The summary fields are absent while FEATURE_SUMMARIES is off; `summaryLine` is the first TL;DR point, null without a summary.
  hasSummary: z.boolean().optional(),
  summaryLine: z.string().max(220).nullable().optional(),
  // Whether the story has enough input to summarise (`hasSummaryInput`).
  canSummarize: z.boolean().optional(),
});
export type StoryCard = z.infer<typeof StoryCardSchema>;

export const StoryDetailSchema = StoryCardSchema.extend({
  firstSeenAt: z.string().datetime(),
  items: z.array(
    SourceRefSchema.extend({
      title: z.string(),
      author: z.string().nullable(),
      publishedAt: z.string().datetime(),
    }),
  ),
  clusterMembers: z.array(StoryCardSchema).optional(),
  summary: StorySummarySchema.nullable().optional(),
});
export type StoryDetail = z.infer<typeof StoryDetailSchema>;

export const StoryLookupRequestSchema = z.object({
  ids: z.array(StoryIdSchema).min(1).max(100),
});
export type StoryLookupRequest = z.infer<typeof StoryLookupRequestSchema>;

export const StoryLookupResponseSchema = z.object({
  items: z.array(StoryCardSchema),
  missingIds: z.array(z.string()),
});
export type StoryLookupResponse = z.infer<typeof StoryLookupResponseSchema>;
