import type { Preferences, Save } from '@devbrief/shared';
import { withoutStories } from './collectionOrder';
import type { GuestCollection } from './collectionsState';

export const GUEST_STATE_VERSION = 1;
/** Matches what one merge request accepts (PRD §6.2), so every local save can reach the account. */
export const MAX_GUEST_SAVES = 500;

/** No follows and no mutes: a new guest's preferences, and what invalid stored ones read as. */
export const EMPTY_PREFERENCES: Preferences = {
  follow: { tags: [], sources: [] },
  mute: { tags: [], sources: [] },
};

export type GuestData = {
  deviceId: string;
  saves: Save[];
  prefs: Preferences;
  collections: GuestCollection[];
  hintDismissed: boolean;
  /** Set while a guest → account merge has started and not yet been confirmed by the server. */
  pendingMerge: boolean;
};

export type ToggleOutcome = 'added' | 'removed' | 'full';

export function createGuestData(deviceId: string): GuestData {
  return {
    deviceId,
    saves: [],
    prefs: EMPTY_PREFERENCES,
    collections: [],
    hintDismissed: false,
    pendingMerge: false,
  };
}

/** Adds the story, or removes it when saved already; a full list refuses new saves rather than dropping old ones. */
export function toggleSave(
  saves: readonly Save[],
  storyId: string,
  now: Date,
): { outcome: ToggleOutcome; saves: Save[] } {
  if (saves.some((save) => save.storyId === storyId)) {
    return { outcome: 'removed', saves: saves.filter((save) => save.storyId !== storyId) };
  }
  if (saves.length >= MAX_GUEST_SAVES) return { outcome: 'full', saves: [...saves] };
  return { outcome: 'added', saves: [...saves, { storyId, savedAt: now.toISOString() }] };
}

export function removeSaves(saves: readonly Save[], storyIds: readonly string[]) {
  const removed = new Set(storyIds);
  return saves.filter((save) => !removed.has(save.storyId));
}

/** Takes the stories out of every collection and closes the gaps in each item list. */
export function withoutStoriesInCollections(
  collections: readonly GuestCollection[],
  storyIds: readonly string[],
): GuestCollection[] {
  return collections.map((collection) => withoutStories(collection, storyIds));
}

/** Newest-saved first; the stored order is insertion order. */
export function sortSavesNewestFirst(saves: readonly Save[]) {
  return [...saves].sort((a, b) => (b.savedAt < a.savedAt ? -1 : b.savedAt > a.savedAt ? 1 : 0));
}

/** Reads the stored text; invalid JSON counts as nothing stored. */
export function parseStoredGuest(text: string | null) {
  if (text === null) return null;
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    return null;
  }
  const version =
    typeof stored === 'object' && stored !== null && 'version' in stored ? stored.version : 0;
  return { state: stored, version: typeof version === 'number' ? version : 0 };
}

/** The text AC-1.4.2 specifies: the version and the guest fields in one flat object. */
export function serializeGuest(data: GuestData) {
  return JSON.stringify({ version: GUEST_STATE_VERSION, ...data });
}
