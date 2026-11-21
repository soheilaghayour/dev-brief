import { z } from 'zod';
import { StoryCardSchema } from './story.js';

export const COLLECTIONS_MAX = 50;
export const COLLECTION_ITEMS_MAX = 500;
export const NOTE_MAX_LENGTH = 20_000;

export const CollectionIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const CollectionSlugSchema = z
  .string()
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

export const CollectionNameSchema = z.string().trim().min(1).max(60);
const CollectionDescriptionSchema = z.string().max(500);

export const CollectionSchema = z.object({
  id: z.string(),
  slug: CollectionSlugSchema,
  name: CollectionNameSchema,
  description: CollectionDescriptionSchema.nullable(),
  position: z.number().int().min(0),
  itemCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const CollectionListSchema = z.object({ items: z.array(CollectionSchema) });
export type CollectionList = z.infer<typeof CollectionListSchema>;

export const CollectionCreateSchema = z.object({
  name: CollectionNameSchema,
  description: CollectionDescriptionSchema.nullable().optional(),
});
export type CollectionCreate = z.infer<typeof CollectionCreateSchema>;

export const CollectionUpdateSchema = z.object({
  name: CollectionNameSchema.optional(),
  description: CollectionDescriptionSchema.nullable().optional(),
  position: z.number().int().min(0).optional(),
});
export type CollectionUpdate = z.infer<typeof CollectionUpdateSchema>;

export const CollectionItemPutSchema = z.object({
  position: z.number().int().min(0).optional(),
});
export type CollectionItemPut = z.infer<typeof CollectionItemPutSchema>;

export const CollectionDetailSchema = z.object({
  collection: CollectionSchema,
  items: z.array(
    z.object({
      story: StoryCardSchema,
      position: z.number().int().min(0),
      addedAt: z.string().datetime(),
      note: z.string().nullable(),
      noteUpdatedAt: z.string().datetime().nullable(),
    }),
  ),
});
export type CollectionDetail = z.infer<typeof CollectionDetailSchema>;
