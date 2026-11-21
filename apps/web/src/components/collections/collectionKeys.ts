export const COLLECTIONS_KEY = ['collections'] as const;

export function collectionKey(id: string) {
  return ['collections', id] as const;
}

const PENDING_ID_PREFIX = 'pending-';

/** A collection the user just created is shown under this id until the server answers. */
export function pendingCollectionId(n: number) {
  return `${PENDING_ID_PREFIX}${n}`;
}

export function isPendingCollectionId(id: string) {
  return id.startsWith(PENDING_ID_PREFIX);
}
