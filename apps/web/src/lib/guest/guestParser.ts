import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  CollectionDescriptionSchema,
  CollectionNameSchema,
  CollectionSlugSchema,
  PreferencesSchema,
  SaveSchema,
  StoryIdSchema,
} from '@devbrief/shared';
import type { Save } from '@devbrief/shared';
import { z } from 'zod';
import { inPositionOrder } from './collectionOrder';
import type { GuestCollection } from './collectionsState';
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

const GuestCollectionItemSchema = z.object({
  storyId: StoryIdSchema,
  position: z.number().int().min(0),
  addedAt: z.string().datetime(),
});

// `items` is salvaged entry by entry afterwards, so one bad item doesn't cost the collection.
const GuestCollectionSchema = z.object({
  id: z.string().min(1),
  slug: CollectionSlugSchema,
  name: CollectionNameSchema,
  description: CollectionDescriptionSchema.nullable(),
  position: z.number().int().min(0),
  items: z.unknown(),
});

function inStoredOrder<T extends { position: number }>(entries: readonly T[]) {
  return inPositionOrder([...entries].sort((a, b) => a.position - b.position));
}

function salvageItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: z.infer<typeof GuestCollectionItemSchema>[] = [];
  for (const entry of value) {
    const parsed = GuestCollectionItemSchema.safeParse(entry);
    if (!parsed.success || seen.has(parsed.data.storyId)) continue;
    seen.add(parsed.data.storyId);
    items.push(parsed.data);
  }
  return inStoredOrder(items.slice(0, COLLECTION_ITEMS_MAX));
}

// Per entry, like saves: an invalid collection or item, or a repeat of a slug, id or story, is dropped and the first one kept.
function salvageCollections(value: unknown): GuestCollection[] {
  if (!Array.isArray(value)) return [];
  const slugs = new Set<string>();
  const ids = new Set<string>();
  const collections: GuestCollection[] = [];
  for (const entry of value) {
    const parsed = GuestCollectionSchema.safeParse(entry);
    if (!parsed.success || slugs.has(parsed.data.slug) || ids.has(parsed.data.id)) continue;
    slugs.add(parsed.data.slug);
    ids.add(parsed.data.id);
    collections.push({ ...parsed.data, items: salvageItems(parsed.data.items) });
  }
  return inStoredOrder(collections.slice(0, COLLECTIONS_MAX));
}

/**
 * True for a stored `collections` field that isn't a list at all. Its entries can't be told apart, so reading it as
 * empty and then saving would erase data that only failed to parse; the caller keeps storage untouched instead.
 */
export function hasUnreadableCollections(stored: unknown) {
  if (typeof stored !== 'object' || stored === null) return false;
  const { collections } = stored as { collections?: unknown };
  return collections !== undefined && collections !== null && !Array.isArray(collections);
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
