import { SaveSchema } from '@devbrief/shared';
import type { Save } from '@devbrief/shared';
import { z } from 'zod';
import { GUEST_STATE_VERSION, MAX_GUEST_SAVES, type GuestData } from './guestState';

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
    hintDismissed: fields.hintDismissed === true,
  };
}

/** Overlays the usable stored fields on the current state. */
export function mergeStoredGuest(stored: unknown, current: GuestData): GuestData {
  return { ...current, ...migrateGuestData(stored, GUEST_STATE_VERSION) };
}
