import { describe, expect, it } from 'vitest';
import { clampPosition, positionShift } from './positionShift.js';

describe('positionShift', () => {
  it('moving earlier pushes the rows from the target up to the old slot later by one', () => {
    expect(positionShift(4, 1)).toEqual({ range: { gte: 1, lte: 3 }, by: 1 });
  });

  it('moving later pulls the rows after the old slot up to the target earlier by one', () => {
    expect(positionShift(1, 4)).toEqual({ range: { gte: 2, lte: 4 }, by: -1 });
  });

  it('does nothing when the row stays', () => {
    expect(positionShift(2, 2)).toBeNull();
  });
});

describe('clampPosition', () => {
  it('keeps the position inside 0..count-1', () => {
    expect(clampPosition(99, 4)).toBe(3);
    expect(clampPosition(2, 4)).toBe(2);
    expect(clampPosition(0, 1)).toBe(0);
  });
});
