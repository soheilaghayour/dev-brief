import { z } from 'zod';
import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  CollectionSlugSchema,
  NOTE_MAX_LENGTH,
} from './collections.js';
import { PreferencesSchema } from './preferences.js';
import { StoryCardSchema, StoryIdSchema } from './story.js';

export const SaveSchema = z.object({
  storyId: StoryIdSchema,
  savedAt: z.string().datetime(),
  // Absent while FEATURE_COLLECTIONS is off, so flag-off responses match Phase 2.
  note: z.string().nullable().optional(),
  noteUpdatedAt: z.string().datetime().nullable().optional(),
});
export type Save = z.infer<typeof SaveSchema>;

export const SavedStoryPageSchema = z.object({
  items: z.array(
    z.object({
      story: StoryCardSchema,
      savedAt: z.string().datetime(),
      note: z.string().nullable().optional(),
      noteUpdatedAt: z.string().datetime().nullable().optional(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export type SavedStoryPage = z.infer<typeof SavedStoryPageSchema>;

export const SaveIdsSchema = z.object({ ids: z.array(z.string()) });
export type SaveIds = z.infer<typeof SaveIdsSchema>;

export const SaveNotePatchSchema = z.object({
  note: z.string().max(NOTE_MAX_LENGTH).nullable(),
});
export type SaveNotePatch = z.infer<typeof SaveNotePatchSchema>;

export const MergeRequestSchema = z.object({
  version: z.literal(1),
  saves: z.array(SaveSchema).max(500),
  preferences: PreferencesSchema.optional(),
  collections: z
    .array(
      z.object({
        slug: CollectionSlugSchema,
        name: z.string().trim().min(1).max(60),
        items: z
          .array(z.object({ storyId: StoryIdSchema, position: z.number().int().min(0) }))
          .max(COLLECTION_ITEMS_MAX),
      }),
    )
    .max(COLLECTIONS_MAX)
    .optional(),
  notes: z
    .array(
      z.object({
        storyId: StoryIdSchema,
        note: z.string().max(NOTE_MAX_LENGTH),
        updatedAt: z.string().datetime(),
      }),
    )
    .max(500)
    .optional(),
});
export type MergeRequest = z.infer<typeof MergeRequestSchema>;

export const MergeResponseSchema = z.object({
  merged: z.object({
    saves: z.number().int(),
    preferences: z.number().int(),
    collections: z.number().int(),
    notes: z.number().int(),
  }),
  skipped: z.object({ saves: z.number().int(), notes: z.number().int() }),
  missingStoryIds: z.array(z.string()),
});
export type MergeResponse = z.infer<typeof MergeResponseSchema>;
