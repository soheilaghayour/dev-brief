import { z } from 'zod';
import { StoryCardSchema, StoryIdSchema } from './story.js';

export const SaveSchema = z.object({
  storyId: StoryIdSchema,
  savedAt: z.string().datetime(),
});
export type Save = z.infer<typeof SaveSchema>;

export const SavedStoryPageSchema = z.object({
  items: z.array(z.object({ story: StoryCardSchema, savedAt: z.string().datetime() })),
  nextCursor: z.string().nullable(),
});
export type SavedStoryPage = z.infer<typeof SavedStoryPageSchema>;

export const SaveIdsSchema = z.object({ ids: z.array(z.string()) });
export type SaveIds = z.infer<typeof SaveIdsSchema>;

export const MergeRequestSchema = z.object({
  version: z.literal(1),
  saves: z.array(SaveSchema).max(500),
});
export type MergeRequest = z.infer<typeof MergeRequestSchema>;

export const MergeResponseSchema = z.object({
  merged: z.object({ saves: z.number().int() }),
  skipped: z.object({ saves: z.number().int() }),
  missingStoryIds: z.array(z.string()),
});
export type MergeResponse = z.infer<typeof MergeResponseSchema>;
