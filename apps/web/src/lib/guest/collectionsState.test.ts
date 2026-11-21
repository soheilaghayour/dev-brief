import { COLLECTION_ITEMS_MAX, COLLECTIONS_MAX, collectionSlug } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import {
  addToCollection,
  createCollection,
  deleteCollection,
  moveCollection,
  removeFromCollection,
  renameCollection,
  type GuestCollection,
} from './collectionsState';
import { MAX_GUEST_SAVES, withoutStoriesInCollections } from './guestState';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function board(id: string, name: string, position: number, storyIds: string[] = []) {
  return {
    id,
    slug: collectionSlug(name, []),
    name,
    description: null,
    position,
    items: storyIds.map((storyId, index) => ({
      storyId,
      position: index,
      addedAt: NOW.toISOString(),
    })),
  } satisfies GuestCollection;
}

const names = (collections: readonly GuestCollection[]) =>
  [...collections].sort((a, b) => a.position - b.position).map(({ name }) => name);

describe('createCollection', () => {
  it('AC-3.4.1 adds a collection at the end with the slug the server would give', () => {
    const first = createCollection([], 'Frontend Architecture', 'id-1');
    expect(first.outcome).toBe('created');
    expect(first.created).toMatchObject({
      slug: collectionSlug('Frontend Architecture', []),
      position: 0,
      items: [],
    });
    const second = createCollection(first.collections, 'Frontend architecture!', 'id-2');
    expect(second.created?.slug).toBe('frontend-architecture-2');
    expect(second.created?.position).toBe(1);
  });

  it('AC-3.4.1 refuses a name the server would refuse', () => {
    expect(createCollection([], '   ', 'id').outcome).toBe('invalid');
    expect(createCollection([], 'x'.repeat(61), 'id').outcome).toBe('invalid');
  });

  it('refuses the 51st collection and keeps the 50', () => {
    const fifty = Array.from({ length: COLLECTIONS_MAX }, (_, index) =>
      board(`id-${index}`, `Board ${index}`, index),
    );
    const result = createCollection(fifty, 'One too many', 'id-new');
    expect(result.outcome).toBe('full');
    expect(result.collections).toHaveLength(COLLECTIONS_MAX);
  });
});

describe('renameCollection', () => {
  it('AC-3.4.1 changes the name and keeps the slug, so the board URL survives', () => {
    const collections = [board('a', 'Reading list', 0)];
    const result = renameCollection(collections, 'a', 'Backlog');
    expect(result.outcome).toBe('renamed');
    expect(result.collections[0]).toMatchObject({ name: 'Backlog', slug: 'reading-list' });
  });

  it('refuses an invalid name and an unknown id', () => {
    const collections = [board('a', 'Reading list', 0)];
    expect(renameCollection(collections, 'a', '').outcome).toBe('invalid');
    expect(renameCollection(collections, 'zzz', 'Backlog').outcome).toBe('missing');
  });
});

describe('moveCollection', () => {
  const three = [board('a', 'A', 0), board('b', 'B', 1), board('c', 'C', 2)];

  it('AC-3.4.1 moves a collection up or down and keeps positions dense', () => {
    const up = moveCollection(three, 'c', 'up');
    expect(names(up)).toEqual(['A', 'C', 'B']);
    expect(up.map(({ position }) => position).sort()).toEqual([0, 1, 2]);
    expect(names(moveCollection(three, 'a', 'down'))).toEqual(['B', 'A', 'C']);
  });

  it('changes nothing at either end', () => {
    expect(names(moveCollection(three, 'a', 'up'))).toEqual(['A', 'B', 'C']);
    expect(names(moveCollection(three, 'c', 'down'))).toEqual(['A', 'B', 'C']);
  });
});

describe('deleteCollection', () => {
  it('AC-3.4.1 removes the collection and closes the gap', () => {
    const rest = deleteCollection(
      [board('a', 'A', 0), board('b', 'B', 1), board('c', 'C', 2)],
      'b',
    );
    expect(rest.map(({ name, position }) => [name, position])).toEqual([
      ['A', 0],
      ['C', 1],
    ]);
  });
});

describe('addToCollection', () => {
  const saved = [{ storyId: 's1', savedAt: '2026-04-01T00:00:00.000Z' }];

  it('AC-3.4.1 lets one saved story belong to several collections', () => {
    const collections = [board('a', 'A', 0), board('b', 'B', 1)];
    const first = addToCollection({ saves: saved, collections }, 'a', 's1', NOW);
    const second = addToCollection(first, 'b', 's1', NOW);
    expect(second.collections.map(({ items }) => items.map(({ storyId }) => storyId))).toEqual([
      ['s1'],
      ['s1'],
    ]);
  });

  it('AC-3.4.3 saves an unsaved story first, as the API does', () => {
    const result = addToCollection(
      { saves: [], collections: [board('a', 'A', 0)] },
      'a',
      's9',
      NOW,
    );
    expect(result.outcome).toBe('added');
    expect(result.saves).toEqual([{ storyId: 's9', savedAt: NOW.toISOString() }]);
  });

  it('adds nothing twice', () => {
    const result = addToCollection(
      { saves: saved, collections: [board('a', 'A', 0, ['s1'])] },
      'a',
      's1',
      NOW,
    );
    expect(result.outcome).toBe('exists');
  });

  it('refuses the 501st item and keeps the 500', () => {
    const items = Array.from({ length: COLLECTION_ITEMS_MAX }, (_, index) => `s${index}`);
    const result = addToCollection(
      { saves: saved, collections: [board('a', 'A', 0, items)] },
      'a',
      'extra',
      NOW,
    );
    expect(result.outcome).toBe('collectionFull');
    expect(result.collections[0]?.items).toHaveLength(COLLECTION_ITEMS_MAX);
  });

  it('refuses to save a new story over the save limit and does not drop an old save', () => {
    const fullSaves = Array.from({ length: MAX_GUEST_SAVES }, (_, index) => ({
      storyId: `old${index}`,
      savedAt: '2026-04-01T00:00:00.000Z',
    }));
    const result = addToCollection(
      { saves: fullSaves, collections: [board('a', 'A', 0)] },
      'a',
      'new',
      NOW,
    );
    expect(result.outcome).toBe('savesFull');
    expect(result.saves).toHaveLength(MAX_GUEST_SAVES);
    expect(result.collections[0]?.items).toEqual([]);
  });

  it('reports an unknown collection', () => {
    expect(addToCollection({ saves: saved, collections: [] }, 'nope', 's1', NOW).outcome).toBe(
      'missing',
    );
  });
});

describe('removing stories', () => {
  it('removeFromCollection leaves the story in other collections and closes the gap', () => {
    const collections = [board('a', 'A', 0, ['s1', 's2', 's3']), board('b', 'B', 1, ['s2'])];
    const result = removeFromCollection(collections, 'a', 's2');
    expect(result[0]?.items.map(({ storyId, position }) => [storyId, position])).toEqual([
      ['s1', 0],
      ['s3', 1],
    ]);
    expect(result[1]?.items).toHaveLength(1);
  });

  it('AC-3.4.1 withoutStoriesInCollections takes an unsaved story out of every collection', () => {
    const collections = [board('a', 'A', 0, ['s1', 's2']), board('b', 'B', 1, ['s2', 's3'])];
    const result = withoutStoriesInCollections(collections, ['s2']);
    expect(result.map(({ items }) => items.map(({ storyId }) => storyId))).toEqual([
      ['s1'],
      ['s3'],
    ]);
    expect(result[1]?.items[0]?.position).toBe(0);
  });
});
