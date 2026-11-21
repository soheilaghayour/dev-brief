import {
  COLLECTION_ITEMS_MAX,
  COLLECTIONS_MAX,
  MERGE_BODY_BUDGET_BYTES,
  MERGE_NOTES_MAX,
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

/** Boards and notes that don't fit a request even alone; they stay on the device. */
export type MergeOversized = { collections: number; notes: number };

export type GuestMergePlan =
  | { action: 'none' }
  | { action: 'clearPending' }
  // Saves and preferences travel in the first request; whole boards and notes fill the requests after it.
  | { action: 'merge'; requests: MergeRequest[]; oversized: MergeOversized };

type GuestMergeInput = {
  saves: readonly Save[];
  prefs: Preferences;
  collections?: readonly GuestCollection[];
  notes?: Readonly<Record<string, GuestNote>>;
  pendingMerge: boolean;
};

type Draft = {
  base: MergeRequest;
  collections: MergeCollection[];
  notes: MergeNote[];
  bytes: number;
};

function newDraft(base: MergeRequest): Draft {
  return { base, collections: [], notes: [], bytes: jsonBytes(base) };
}

/** Packs whole boards, then notes, into requests under the body budget; a part that fits no request even alone is counted, not sent. */
function packRequests(
  first: MergeRequest,
  boards: readonly MergeCollection[],
  notes: readonly MergeNote[],
) {
  const drafts = [newDraft(first)];
  const oversized: MergeOversized = { collections: 0, notes: 0 };

  // `,"notes":[]` is what a request gains from its first note.
  function fieldBytes(draft: Draft, field: 'collections' | 'notes') {
    return draft[field].length === 0 ? `,"${field}":[]`.length : 0;
  }
  function fits(draft: Draft, field: 'collections' | 'notes', partBytes: number) {
    const isNoteFull = field === 'notes' && draft.notes.length >= MERGE_NOTES_MAX;
    return (
      !isNoteFull && draft.bytes + fieldBytes(draft, field) + partBytes <= MERGE_BODY_BUDGET_BYTES
    );
  }
  function add<Part extends MergeCollection | MergeNote>(
    field: 'collections' | 'notes',
    part: Part,
  ) {
    const partBytes = jsonBytes(part) + 1;
    let draft = drafts[drafts.length - 1] as Draft;
    if (!fits(draft, field, partBytes)) {
      draft = newDraft({ version: 1, saves: [] });
      drafts.push(draft);
      if (!fits(draft, field, partBytes)) {
        oversized[field] += 1;
        return;
      }
    }
    draft.bytes += partBytes + fieldBytes(draft, field);
    (draft[field] as Part[]).push(part);
  }

  for (const board of boards) add('collections', board);
  for (const note of notes) add('notes', note);
  const requests = drafts
    .map(({ base, collections, notes: draftNotes }): MergeRequest => ({
      ...base,
      ...(collections.length > 0 && { collections }),
      ...(draftNotes.length > 0 && { notes: draftNotes }),
    }))
    .filter(
      (request) =>
        request.saves.length > 0 ||
        request.preferences !== undefined ||
        request.collections !== undefined ||
        request.notes !== undefined,
    );
  return { requests, oversized };
}

/** Decides what a signed-in load does with the guest data: nothing, clear a stale flag, or send it in requests that each fit the body limit. */
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
  };
  const { requests, oversized } = packRequests(
    first,
    sortCollections(collections).map(toMergeCollection),
    mergeNotes,
  );
  return { action: 'merge', requests, oversized };
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

/** The boards and notes the device keeps after a confirmed request: one that changed since the request was built still holds something the account lacks. */
export function keptAfterMerge(
  held: { collections: readonly GuestCollection[]; notes: Readonly<Record<string, GuestNote>> },
  sent: { collections: readonly MergeCollection[]; notes: readonly MergeNote[] },
) {
  const sentBoards = new Map(sent.collections.map((board) => [board.slug, JSON.stringify(board)]));
  const sentNotes = new Map(sent.notes.map((note) => [note.storyId, note]));
  return {
    collections: sortCollections(held.collections)
      .filter((board) => sentBoards.get(board.slug) !== JSON.stringify(toMergeCollection(board)))
      .map((board, position) => ({ ...board, position })),
    notes: Object.fromEntries(
      Object.entries(held.notes).filter(([storyId, note]) => {
        const was = sentNotes.get(storyId);
        return !(was && was.note === note.note && was.updatedAt === note.updatedAt);
      }),
    ),
  };
}

/** The toast for boards and notes too big for any request, which stay on the device. */
export function oversizedNotice({ collections, notes }: MergeOversized) {
  const parts = [
    ...(collections > 0 ? [count(collections, 'collection', 'collections')] : []),
    ...(notes > 0 ? [count(notes, 'note', 'notes')] : []),
  ];
  return parts.length === 0
    ? undefined
    : `${joinParts(parts)} too large to sync, so they stay on this device`;
}

export function count(amount: number, one: string, many: string) {
  return `${amount} ${amount === 1 ? one : many}`;
}

export function joinParts(parts: readonly string[]) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function total(responses: readonly MergeResponse[], pick: (response: MergeResponse) => number) {
  return responses.reduce((sum, response) => sum + pick(response), 0);
}

/**
 * The toasts for the confirmed responses: what arrived, then what couldn't be merged.
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
