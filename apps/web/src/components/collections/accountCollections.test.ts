import { describe, expect, it } from 'vitest';
import type { Collection, CollectionDetail } from '@devbrief/shared';
import {
  detailWithoutItems,
  listItemCount,
  listMoved,
  listWithCreated,
  listWithout,
} from './accountCollections';

const row = (id: string, position: number, itemCount = 0) =>
  ({ id, slug: id, name: id, description: null, position, itemCount }) as Collection;
const list = (...ids: string[]) => ({ items: ids.map((id, position) => row(id, position)) });
const ids = (data: { items: Collection[] } | undefined) =>
  data?.items.map(({ id, position }) => `${id}:${position}`);

describe('account collection cache patches', () => {
  it('AC-3.4.1 moves a collection to an index and keeps positions dense', () => {
    expect(ids(listMoved(list('a', 'b', 'c'), 'a', 2))).toEqual(['b:0', 'c:1', 'a:2']);
    expect(ids(listMoved(list('a', 'b', 'c'), 'c', 0))).toEqual(['c:0', 'a:1', 'b:2']);
    expect(ids(listMoved(list('a', 'b'), 'a', 9))).toEqual(['b:0', 'a:1']);
  });

  it('AC-3.4.1 deletes a collection and closes the gap', () => {
    expect(ids(listWithout(list('a', 'b', 'c'), 'b'))).toEqual(['a:0', 'c:1']);
  });

  it('AC-3.4.1 adds a created collection at the end', () => {
    expect(ids(listWithCreated(list('a'), row('b', 0)))).toEqual(['a:0', 'b:1']);
  });

  it('counts items up and down, never below zero', () => {
    expect(listItemCount({ items: [row('a', 0, 1)] }, 'a', -3)?.items[0]?.itemCount).toBe(0);
    expect(listItemCount({ items: [row('a', 0, 1)] }, 'a', 1)?.items[0]?.itemCount).toBe(2);
  });

  it('leaves a list that has not loaded yet alone', () => {
    expect(listMoved(undefined, 'a', 0)).toBeUndefined();
    expect(detailWithoutItems(undefined, ['x'])).toBeUndefined();
  });

  it('AC-3.4.1 takes stories off a board and closes the gaps', () => {
    const detail = {
      collection: row('a', 0, 3),
      items: ['x', 'y', 'z'].map((id, position) => ({
        story: { id },
        position,
        addedAt: '2026-05-01T10:00:00.000Z',
        note: null,
        noteUpdatedAt: null,
      })),
    } as unknown as CollectionDetail;
    const after = detailWithoutItems(detail, ['y']);
    expect(after?.items.map((item) => [item.story.id, item.position])).toEqual([
      ['x', 0],
      ['z', 1],
    ]);
    expect(after?.collection.itemCount).toBe(2);
  });
});
