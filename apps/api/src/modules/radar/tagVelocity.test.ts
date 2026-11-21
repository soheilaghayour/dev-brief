import { describe, expect, it } from 'vitest';
import { computeTagVelocity, radarStartDay, type TagDayStat } from './tagVelocity.js';

// Both windows end on yesterday, 2026-06-30: the current 7d window is 06-24..06-30, the previous one 06-17..06-23.
const NOW = new Date('2026-07-01T12:00:00Z');

const stat = (day: string, tag: string, storyCount: number, engagementSum = 0): TagDayStat => ({
  day: new Date(`${day}T00:00:00Z`),
  tag,
  storyCount,
  engagementSum,
});

const compute = (
  stats: TagDayStat[],
  overrides: Partial<Parameters<typeof computeTagVelocity>[0]> = {},
) => computeTagVelocity({ stats, window: '7d', metric: 'stories', now: NOW, ...overrides });

describe('computeTagVelocity', () => {
  it('AC-3.3.2 gives a zero point for every window day without a row', () => {
    const radar = compute([stat('2026-06-26', 'rust', 4)], { tags: ['rust'] });
    expect(radar.series[0]?.points).toEqual([
      { date: '2026-06-24', value: 0 },
      { date: '2026-06-25', value: 0 },
      { date: '2026-06-26', value: 4 },
      { date: '2026-06-27', value: 0 },
      { date: '2026-06-28', value: 0 },
      { date: '2026-06-29', value: 0 },
      { date: '2026-06-30', value: 0 },
    ]);
  });

  it('AC-3.3.2 returns 30 points for a 30d window and 7 for 7d, empty input included', () => {
    expect(compute([], { window: '30d', tags: ['rust'] }).series[0]?.points).toHaveLength(30);
    expect(compute([], { tags: ['rust'] }).series[0]?.points).toHaveLength(7);
    const empty = compute([]);
    expect(empty.series).toEqual([]);
    expect(empty.movers).toEqual([]);
  });

  it('AC-3.3.2 counts the 7 UTC days ending yesterday, today excluded, and the 7 before as previous', () => {
    const radar = compute([
      stat('2026-06-30', 'rust', 1), // yesterday: newest current day
      stat('2026-06-24', 'rust', 2), // oldest current day
      stat('2026-06-23', 'rust', 4), // newest previous day
      stat('2026-06-17', 'rust', 8), // oldest previous day
      stat('2026-06-16', 'rust', 100), // outside both windows
      stat('2026-07-01', 'rust', 100), // today: partial, counts for neither window
    ]);
    expect(radar.movers).toEqual([
      { tag: 'rust', label: 'Rust', current: 3, previous: 12, deltaPct: -75 },
    ]);
  });

  it('AC-3.3.2 buckets by UTC day at 23:30 UTC under TZ=Europe/Berlin', () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
      // 23:30 UTC is already 01:30 the next day in Berlin; the UTC day must win.
      const lateNow = new Date('2026-07-01T23:30:00Z');
      expect(radarStartDay('7d', lateNow).toISOString()).toBe('2026-06-17T00:00:00.000Z');
      const radar = computeTagVelocity({
        stats: [stat('2026-06-30', 'rust', 5), stat('2026-06-23', 'rust', 2)],
        window: '7d',
        metric: 'stories',
        now: lateNow,
        tags: ['rust'],
      });
      expect(radar.series[0]?.points.at(-1)).toEqual({ date: '2026-06-30', value: 5 });
      expect(radar.series[0]?.points[0]?.date).toBe('2026-06-24');
      expect(radar.movers[0]).toMatchObject({ current: 5, previous: 2 });
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
  });

  it('AC-3.3.2 sets deltaPct to null when the previous window is 0 and to -100 when the current is', () => {
    const radar = compute([stat('2026-06-30', 'rust', 3), stat('2026-06-20', 'vue', 2)]);
    expect(radar.movers.find((mover) => mover.tag === 'rust')?.deltaPct).toBeNull();
    expect(radar.movers.find((mover) => mover.tag === 'vue')).toMatchObject({
      current: 0,
      previous: 2,
      deltaPct: -100,
    });
  });

  it('AC-3.3.2 leaves a tag that is 0 in both windows out of the movers', () => {
    const radar = compute([stat('2026-06-30', 'rust', 3), stat('2026-06-16', 'vue', 5)]);
    expect(radar.movers.map(({ tag }) => tag)).toEqual(['rust']);
  });

  it('AC-3.3.2 rounds a .5 percentage away from zero, symmetrically', () => {
    const delta = (current: number, previous: number) =>
      compute([stat('2026-06-30', 'rust', current), stat('2026-06-20', 'rust', previous)]).movers[0]
        ?.deltaPct;
    expect(delta(63, 40)).toBe(58); // 57.5
    expect(delta(41, 40)).toBe(3); // +2.5
    expect(delta(39, 40)).toBe(-3); // -2.5
  });

  it('AC-3.3.2 shows a steady 10 stories a day as Δ = 0 at 01:00 and at 12:00 UTC', () => {
    const steady = Array.from({ length: 14 }, (_, index) =>
      stat(new Date(Date.UTC(2026, 5, 17 + index)).toISOString().slice(0, 10), 'rust', 10),
    );
    for (const now of ['2026-07-01T01:00:00Z', '2026-07-01T12:00:00Z']) {
      const radar = compute(
        // Today's row is partial at any hour and must not count.
        [...steady, stat('2026-07-01', 'rust', 1)],
        { now: new Date(now) },
      );
      expect(radar.movers).toEqual([
        { tag: 'rust', label: 'Rust', current: 70, previous: 70, deltaPct: 0 },
      ]);
    }
  });

  it('AC-3.3.2 rounds deltaPct to an integer and never returns -0', () => {
    const rounds = compute([stat('2026-06-30', 'rust', 5), stat('2026-06-20', 'rust', 3)]);
    expect(rounds.movers[0]?.deltaPct).toBe(67); // 66.67
    const tinyDrop = compute([stat('2026-06-30', 'rust', 1999), stat('2026-06-20', 'rust', 2000)]);
    expect(Object.is(tinyDrop.movers[0]?.deltaPct, 0)).toBe(true); // -0.05 rounds to -0
  });

  it('AC-3.3.2 orders movers by absolute change, then slug, and drops tags with no data', () => {
    const radar = compute([
      stat('2026-06-30', 'ai-llms', 62),
      stat('2026-06-20', 'ai-llms', 10), // +52
      stat('2026-06-30', 'rust', 25),
      stat('2026-06-20', 'rust', 10), // +15
      stat('2026-06-30', 'vue', 3),
      stat('2026-06-20', 'vue', 10), // -7
      stat('2026-06-30', 'go', 7), // +7, ties with vue's |-7|: go sorts first
      stat('2026-06-30', 'typescript', 1), // 1 -> new, +1
    ]);
    expect(radar.movers.map(({ tag, current, previous }) => [tag, current - previous])).toEqual([
      ['ai-llms', 52],
      ['rust', 15],
      ['go', 7],
      ['vue', -7],
      ['typescript', 1],
    ]);
  });

  it('AC-3.3.1 defaults the series to the top 5 movers, in mover order', () => {
    const tags = ['react', 'vue', 'rust', 'go', 'python', 'typescript'] as const;
    const radar = compute(tags.map((tag, index) => stat('2026-06-30', tag, index + 1)));
    expect(radar.series.map(({ tag }) => tag)).toEqual([
      'typescript',
      'python',
      'go',
      'rust',
      'vue',
    ]);
  });

  it('AC-3.3.1 returns the requested tags in request order, zero-filled, ignoring duplicates', () => {
    const radar = compute([stat('2026-06-30', 'rust', 3)], { tags: ['vue', 'rust', 'vue'] });
    expect(radar.series.map(({ tag, label }) => [tag, label])).toEqual([
      ['vue', 'Vue'],
      ['rust', 'Rust'],
    ]);
    expect(radar.series[0]?.points.every(({ value }) => value === 0)).toBe(true);
  });

  it('AC-3.3.2 sums engagementSum for the engagement metric and storyCount for stories', () => {
    const stats = [
      stat('2026-06-30', 'rust', 2, 500),
      stat('2026-06-29', 'rust', 1, 100),
      stat('2026-06-20', 'rust', 4, 200),
    ];
    const engagement = compute(stats, { metric: 'engagement', tags: ['rust'] });
    expect(engagement.metric).toBe('engagement');
    expect(engagement.movers[0]).toMatchObject({ current: 600, previous: 200, deltaPct: 200 });
    expect(engagement.series[0]?.points.at(-1)?.value).toBe(500);
    const stories = compute(stats, { tags: ['rust'] });
    expect(stories.movers[0]).toMatchObject({ current: 3, previous: 4, deltaPct: -25 });
  });

  it('AC-3.3.2 uses the 30 days before the window as previous for 30d', () => {
    const radar = compute(
      [stat('2026-06-01', 'rust', 1), stat('2026-05-02', 'rust', 2), stat('2026-05-01', 'rust', 9)],
      {
        window: '30d',
      },
    );
    // current 06-01..06-30, previous 05-02..05-31
    expect(radar.movers[0]).toMatchObject({ current: 1, previous: 2 });
    expect(radarStartDay('30d', NOW).toISOString()).toBe('2026-05-02T00:00:00.000Z');
  });
});
