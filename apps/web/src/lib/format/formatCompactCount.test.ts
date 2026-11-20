import { describe, expect, it } from 'vitest';
import { formatCompactCount } from './formatCompactCount';

describe('formatCompactCount', () => {
  it.each([
    [0, '0'],
    [950, '950'],
    [999, '999'],
    [1000, '1k'],
    [1234, '1.2k'],
    [9999, '10k'],
    [15000, '15k'],
    [123_456, '123k'],
    [999_999, '1M'],
    [1_500_000, '1.5M'],
  ])('AC-2.4.1 formats %i as %s', (count, expected) => {
    expect(formatCompactCount(count)).toBe(expected);
  });
});
