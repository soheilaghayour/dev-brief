import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  CollectionNameSchema,
  CollectionSlugSchema,
  PreferencesSchema,
  SaveSchema,
} from '@devbrief/shared';
import type { Save } from '@devbrief/shared';
import { z } from 'zod';
import {
  EMPTY_PREFERENCES,
  GUEST_STATE_VERSION,
  MAX_GUEST_SAVES,
  type GuestData,
} from './guestState';

const DeviceIdSchema = z.string().uuid();

function salvageSaves(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const saves: Save[] = [];
  for (const entry of value) {
    const parsed = SaveSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.storyId)) continue;
    seen.add(parsed.data.storyId);
    saves.push(parsed.data);
  }
  return saves.slice(0, MAX_GUEST_SAVES);
}

// All or nothing: a set that breaks one rule (a cap, a value both followed and muted) can't be trusted in part.
function salvagePrefs(value: unknown) {
  const parsed = PreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_PREFERENCES;
}

const GuestCollectionSchema = z.object({
  id: z.string().min(1),
  slug: CollectionSlugSchema,
  name: CollectionNameSchema,
  description: z.string().max(500).nullable(),
  position: z.number().int().min(0),
  items: z
    .array(
      z.object({
        storyId: z.string().min(1),
        position: z.number().int().min(0),
        addedAt: z.string().datetime(),
      }),
    )
    .max(COLLECTION_ITEMS_MAX),
});

const GuestCollectionsSchema = z
  .array(GuestCollectionSchema)
  .max(COLLECTIONS_MAX)
  .refine(
    (collections) =>
      new Set(collections.map(({ slug }) => slug)).size === collections.length &&
      new Set(collections.map(({ id }) => id)).size === collections.length,
    'duplicate slug or id',
  );

// All or nothing, like preferences: a set that breaks a limit or repeats a slug would merge differently from what the user sees.
function salvageCollections(value: unknown) {
  const parsed = GuestCollectionsSchema.safeParse(value);
  if (!parsed.success) return [];
  return [...parsed.data]
    .sort((a, b) => a.position - b.position)
    .map((collection, position) => ({
      ...collection,
      position,
      items: [...collection.items]
        .sort((a, b) => a.position - b.position)
        .map((item, itemPosition) => ({ ...item, position: itemPosition })),
    }));
}

/**
 * Turns whatever storage held into usable guest fields, dropping what is invalid.
 * Returns null for a value that is not an object or comes from a newer version.
 */
export function migrateGuestData(stored: unknown, version: number): Partial<GuestData> | null {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return null;
  if (version > GUEST_STATE_VERSION) return null;
  const fields: Record<string, unknown> = { ...stored };
  const deviceId = DeviceIdSchema.safeParse(fields.deviceId);
  return {
    ...(deviceId.success && { deviceId: deviceId.data }),
    saves: salvageSaves(fields.saves),
    prefs: salvagePrefs(fields.prefs),
    collections: salvageCollections(fields.collections),
    hintDismissed: fields.hintDismissed === true,
    pendingMerge: fields.pendingMerge === true,
  };
}

/** Overlays the usable stored fields on the current state. */
export function mergeStoredGuest(stored: unknown, current: GuestData): GuestData {
  return { ...current, ...migrateGuestData(stored, GUEST_STATE_VERSION) };
}
