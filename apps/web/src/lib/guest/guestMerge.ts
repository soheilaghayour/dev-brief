import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  NOTE_MAX_LENGTH,
  type MergeRequest,
  type MergeResponse,
  type Preferences,
  type Save,
} from '@devbrief/shared';
import { itemsInOrder, sortCollections } from './collectionOrder';
import type { GuestCollection } from './collectionsState';
import { MAX_GUEST_SAVES, type GuestNote } from './guestState';

function hasPreferences({ follow, mute }: Preferences) {
  return [follow.tags, follow.sources, mute.tags, mute.sources].some((list) => list.length > 0);
}

export type MergeCollection = NonNullable<MergeRequest['collections']>[number];
export type MergeNote = NonNullable<MergeRequest['notes']>[number];

/** One request body may be 512 KB (PRD §8.6); the margin covers the envelope. */
export const MERGE_BODY_BUDGET_BYTES = 480_000;
const MAX_NOTES_PER_REQUEST = 500;
// `,"notes":[]` is what a request without notes gains from its first note.
const NOTES_FIELD_BYTES = ',"notes":[]'.length;

const encoder = new TextEncoder();
function jsonBytes(value: unknown) {
  return encoder.encode(JSON.stringify(value)).length;
}

/** How the merge sees a guest board: matched by slug, its items in board order. */
export function toMergeCollection(collection: GuestCollection): MergeCollection {
  return {
    slug: collection.slug,
    name: collection.name,
    items: itemsInOrder(collection).map(({ storyId, position }) => ({ storyId, position })),
  };
}

export function toMergeNote(storyId: string, { note, updatedAt }: GuestNote): MergeNote {
  return { storyId, note, updatedAt };
}

export type GuestMergePlan =
  | { action: 'none' }
  | { action: 'clearPending' }
  // Saves, preferences and collections travel in the first request; the others only carry notes.
  | { action: 'merge'; requests: MergeRequest[] };

type GuestMergeInput = {
  saves: readonly Save[];
  prefs: Preferences;
  collections?: readonly GuestCollection[];
  notes?: Readonly<Record<string, GuestNote>>;
  pendingMerge: boolean;
};

/** Splits the notes over requests under the body limit; a note is at most 20,000 characters, so one always fits alone. */
function chunkNotes(first: MergeRequest, notes: readonly MergeNote[]) {
  const chunks: { base: MergeRequest; notes: MergeNote[]; bytes: number }[] = [];
  function open(base: MergeRequest) {
    chunks.push({ base, notes: [], bytes: jsonBytes(base) + NOTES_FIELD_BYTES });
  }
  open(first);
  for (const note of notes) {
    const noteBytes = jsonBytes(note) + 1;
    const last = chunks[chunks.length - 1];
    const isFull =
      last !== undefined &&
      last.notes.length > 0 &&
      (last.notes.length >= MAX_NOTES_PER_REQUEST ||
        last.bytes + noteBytes > MERGE_BODY_BUDGET_BYTES);
    if (isFull) open({ version: 1, saves: [] });
    const target = chunks[chunks.length - 1];
    target?.notes.push(note);
    if (target) target.bytes += noteBytes;
  }
  return chunks.map(({ base, notes: chunkNotes }) =>
    chunkNotes.length > 0 ? { ...base, notes: chunkNotes } : base,
  );
}

/** Decides what a signed-in load does with the guest data: nothing, clear a stale flag, or send saves, preferences and collections, then the notes, in as few requests as the body limit allows. */
export function planGuestMerge({
  saves,
  prefs,
  collections = [],
  notes = {},
  pendingMerge,
}: GuestMergeInput): GuestMergePlan {
  const sendsPrefs = hasPreferences(prefs);
  // Notes are sent whether or not their story is still in the saves: a confirmed merge removes the saves first.
  const mergeNotes = Object.entries(notes).map(([storyId, note]) => toMergeNote(storyId, note));
  if (saves.length === 0 && !sendsPrefs && collections.length === 0 && mergeNotes.length === 0) {
    return pendingMerge ? { action: 'clearPending' } : { action: 'none' };
  }
  const first: MergeRequest = {
    version: 1,
    saves: saves.slice(0, MAX_GUEST_SAVES),
    ...(sendsPrefs && { preferences: prefs }),
    ...(collections.length > 0 && {
      collections: sortCollections(collections).map(toMergeCollection),
    }),
  };
  return { action: 'merge', requests: chunkNotes(first, mergeNotes) };
}

/** What the device lets go of once the server confirmed one request. */
export type GuestMergeRelease = {
  /** Local saves the server has dealt with: stored in the account, or gone for good. */
  storyIds: string[];
  /** The preferences the request carried, which the account now holds; undefined when it carried none. */
  preferences: Preferences | undefined;
  collections: MergeCollection[];
  notes: MergeNote[];
};

export function guestMergeRelease(request: MergeRequest): GuestMergeRelease {
  return {
    storyIds: request.saves.map((save) => save.storyId),
    preferences: request.preferences,
    collections: request.collections ?? [],
    notes: request.notes ?? [],
  };
}

function count(amount: number, one: string, many: string) {
  return `${amount} ${amount === 1 ? one : many}`;
}

function joinParts(parts: readonly string[]) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function total(responses: readonly MergeResponse[], pick: (response: MergeResponse) => number) {
  return responses.reduce((sum, response) => sum + pick(response), 0);
}

/**
 * The toasts for the confirmed responses: what arrived, then what couldn't be merged. `skipped.saves` counts unknown
 * stories across saves, board items and notes, so it is never worded as a number of saves.
 */
export function mergeNotices(responses: readonly MergeResponse[]): string[] {
  const arrived = [
    [total(responses, (response) => response.merged.saves), 'saved story', 'saved stories'],
    [total(responses, (response) => response.merged.collections), 'collection', 'collections'],
    [total(responses, (response) => response.merged.notes), 'note', 'notes'],
  ] as const;
  const syncedParts = arrived
    .filter(([amount]) => amount > 0)
    .map(([amount, one, many]) => count(amount, one, many));
  const notices = syncedParts.length > 0 ? [`${joinParts(syncedParts)} synced`] : [];

  const skippedNotes = total(responses, (response) => response.skipped.notes);
  if (skippedNotes > 0) {
    const limit = NOTE_MAX_LENGTH.toLocaleString('en-US');
    notices.push(
      skippedNotes === 1
        ? `1 note couldn't be merged: together with the account's note it is over ${limit} characters`
        : `${skippedNotes} notes couldn't be merged: together with the account's notes they are over ${limit} characters`,
    );
  }
  const skippedCollections = total(responses, (response) => response.skipped.collections);
  if (skippedCollections > 0) {
    notices.push(
      `${count(skippedCollections, 'collection', 'collections')} couldn't be merged: an account holds at most ${COLLECTIONS_MAX} collections`,
    );
  }
  const skippedItems = total(responses, (response) => response.skipped.items);
  if (skippedItems > 0) {
    notices.push(
      `${count(skippedItems, 'story', 'stories')} couldn't be added to a collection: a collection holds at most ${COLLECTION_ITEMS_MAX} stories`,
    );
  }
  return notices;
}
