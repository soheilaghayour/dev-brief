import { describe, expect, it } from 'vitest';
import { isoWeekOf, isoWeekRange, recentIsoWeeks } from './isoWeek.js';

describe('isoWeekOf', () => {
  it('AC-3.4.4 Sunday 23:59 UTC is the old week and Monday 00:00 UTC the new one', () => {
    expect(isoWeekOf(new Date('2026-11-22T23:59:59.999Z'))).toBe('2026-W47');
    expect(isoWeekOf(new Date('2026-11-23T00:00:00.000Z'))).toBe('2026-W48');
  });

  it('AC-3.4.4 knows week 53 and the weeks spanning two years', () => {
    expect(isoWeekOf(new Date('2020-12-31T12:00:00Z'))).toBe('2020-W53');
    expect(isoWeekOf(new Date('2021-01-03T12:00:00Z'))).toBe('2020-W53');
    expect(isoWeekOf(new Date('2021-01-04T00:00:00Z'))).toBe('2021-W01');
    expect(isoWeekOf(new Date('2024-12-30T12:00:00Z'))).toBe('2025-W01');
    expect(isoWeekOf(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
  });
});

describe('isoWeekRange', () => {
  it('AC-3.4.4 runs from Monday 00:00 UTC to the next Monday, end excluded', () => {
    const { start, end } = isoWeekRange('2026-W47');
    expect(start.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-23T00:00:00.000Z');
  });

  it('AC-3.4.4 every instant of a range belongs to its week', () => {
    const { start, end } = isoWeekRange('2020-W53');
    expect(isoWeekOf(start)).toBe('2020-W53');
    expect(isoWeekOf(new Date(end.getTime() - 1))).toBe('2020-W53');
    expect(isoWeekOf(end)).toBe('2021-W01');
  });

  it('rejects weeks that do not exist', () => {
    expect(() => isoWeekRange('2025-W53')).toThrow(RangeError);
    expect(() => isoWeekRange('2026-W00')).toThrow(RangeError);
    expect(() => isoWeekRange('soon')).toThrow(RangeError);
  });
});

describe('recentIsoWeeks', () => {
  it('AC-3.4.4 lists the current week first and then the previous ones, across a year end', () => {
    expect(recentIsoWeeks(new Date('2021-01-12T08:00:00Z'), 4)).toEqual([
      '2021-W02',
      '2021-W01',
      '2020-W53',
      '2020-W52',
    ]);
  });
});
