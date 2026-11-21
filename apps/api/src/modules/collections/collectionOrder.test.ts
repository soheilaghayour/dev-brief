import { describe, expect, it } from 'vitest';
import { moveToPosition } from './collectionOrder.js';

describe('moveToPosition', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves an id earlier and later', () => {
    expect(moveToPosition(ids, 'd', 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveToPosition(ids, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('clamps a position past the end to the last place and below zero to the first', () => {
    expect(moveToPosition(ids, 'a', 99)).toEqual(['b', 'c', 'd', 'a']);
    expect(moveToPosition(ids, 'c', -3)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('keeps the order when the id is already at the position', () => {
    expect(moveToPosition(ids, 'b', 1)).toEqual(ids);
  });
});
