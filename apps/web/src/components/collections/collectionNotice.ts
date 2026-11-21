import { COLLECTION_ITEMS_MAX, COLLECTIONS_MAX } from '@devbrief/shared';
import type { AddItemOutcome, CreateOutcome } from '@/lib/guest/collectionsState';
import { MAX_GUEST_SAVES } from '@/lib/guest/guestState';

const MESSAGES: Partial<Record<CreateOutcome | AddItemOutcome, string>> = {
  full: `You can have up to ${COLLECTIONS_MAX} collections. Delete one first.`,
  collectionFull: `A collection holds up to ${COLLECTION_ITEMS_MAX} stories. Remove one first.`,
  savesFull: `You can keep up to ${MAX_GUEST_SAVES} saves as a guest. Remove one or sign in.`,
};

/** The toast a refused change deserves, or null when nothing was refused. */
export function collectionNotice(outcome: CreateOutcome | AddItemOutcome): string | null {
  return MESSAGES[outcome] ?? null;
}
