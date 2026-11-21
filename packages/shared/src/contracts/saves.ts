import { z } from 'zod';
import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  CollectionNameSchema,
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

/** Notes in one merge request. */
export const MERGE_NOTES_MAX = 500;
/** The API's body limit for a merge request (PRD §8.6). */
export const MERGE_BODY_LIMIT_BYTES = 512 * 1024;
/** What the web fills a merge request to, leaving the envelope and the encoding of what it measured as margin. */
export const MERGE_BODY_BUDGET_BYTES = 480_000;

export const MergeRequestSchema = z.object({
  version: z.literal(1),
  saves: z.array(z.object({ storyId: StoryIdSchema, savedAt: z.string().datetime() })).max(500),
  preferences: PreferencesSchema.optional(),
  collections: z
    .array(
      z.object({
        slug: CollectionSlugSchema,
        name: CollectionNameSchema,
        items: z
          .array(z.object({ storyId: StoryIdSchema, position: z.number().int().min(0) }))
          .max(COLLECTION_ITEMS_MAX),
      }),
    )
    .max(COLLECTIONS_MAX)
    // The merge matches by slug, so a repeat in one request would be two answers to one key.
    .refine((boards) => new Set(boards.map((board) => board.slug)).size === boards.length, {
      message: 'Collection slugs must be unique.',
    })
    .optional(),
  notes: z
    .array(
      z.object({
        storyId: StoryIdSchema,
        note: z.string().max(NOTE_MAX_LENGTH),
        updatedAt: z.string().datetime(),
      }),
    )
    .max(MERGE_NOTES_MAX)
    .optional(),
});
export type MergeRequest = z.infer<typeof MergeRequestSchema>;

// `.default(0)` on the fields added later, so a new web parses the response of an older API during a rolling deploy.
export const MergeResponseSchema = z.object({
  merged: z.object({
    saves: z.number().int(),
    preferences: z.number().int(),
    collections: z.number().int().default(0),
    notes: z.number().int().default(0),
  }),
  skipped: z.object({
    /** Unknown story ids across saves, collection items and notes together, not only saves. */
    saves: z.number().int(),
    notes: z.number().int().default(0),
    /** New collections left out past the collection limit. */
    collections: z.number().int().default(0),
    /** Stories left out past a collection's item limit. */
    items: z.number().int().default(0),
  }),
  missingStoryIds: z.array(z.string()),
});
export type MergeResponse = z.infer<typeof MergeResponseSchema>;
