import { describe, expect, it } from 'vitest';
import {
  MIN_SAMPLE,
  MULTI_SOURCE_BONUS,
  RANK_GRAVITY,
  RSS_BASELINE,
  TOP_WINDOW_DAYS,
  itemEngagement,
  itemPercentile,
  percentile,
  rankScore,
  storyPercentile,
  topWindowStart,
} from './ranking.js';

const NOW = new Date('2026-06-01T12:00:00Z');

function hoursAgo(hours: number) {
  return new Date(NOW.getTime() - hours * 3_600_000);
}

function sample(size: number) {
  return Array.from({ length: size }, (_, index) => index + 1);
}

describe('constants', () => {
  it('match Appendix B', () => {
    expect([RANK_GRAVITY, RSS_BASELINE, MULTI_SOURCE_BONUS, TOP_WINDOW_DAYS, MIN_SAMPLE]).toEqual([
      1.5, 0.6, 0.15, 7, 10,
    ]);
  });
});

describe('itemEngagement', () => {
  it.each([
    ['hn uses points', { kind: 'hn', points: 300, commentsCount: 99 }, 300],
    [
      'devto adds reactions and comments',
      { kind: 'devto', reactionsCount: 300, commentsCount: 20 },
      320,
    ],
    ['devto tolerates missing counts', { kind: 'devto', reactionsCount: 5 }, 5],
    ['github uses stars', { kind: 'github', stars: 42 }, 42],
    ['rss has none', { kind: 'rss', points: 9 }, 0],
    ['hn without points is 0', { kind: 'hn', points: null }, 0],
    ['github without stars is 0', { kind: 'github' }, 0],
  ] as const)('%s', (_name, item, expected) => {
    expect(itemEngagement(item)).toBe(expected);
  });
});

describe('percentile', () => {
  it('is (countBelow + 0.5 * countEqual) / n', () => {
    // 10 values: 4 below 5, 2 equal (5, 5), 4 above -> (4 + 1) / 10
    expect(percentile(5, [1, 2, 3, 4, 5, 5, 6, 7, 8, 9])).toBe(0.5);
    expect(percentile(9, [1, 2, 3, 4, 5, 5, 6, 7, 8, 9])).toBe(0.95);
    expect(percentile(1, [1, 2, 3, 4, 5, 5, 6, 7, 8, 9])).toBe(0.05);
  });

  it('stays strictly between 0 and 1', () => {
    const values = sample(50);
    expect(percentile(1, values)).toBeGreaterThan(0);
    expect(percentile(50, values)).toBeLessThan(1);
  });

  it('gives 0.5 for every item when all engagement is equal', () => {
    expect(percentile(7, Array<number>(20).fill(7))).toBe(0.5);
  });

  it('uses the small-sample guard below 10 items', () => {
    expect(percentile(100, sample(9))).toBe(0.5);
    expect(percentile(1, sample(9))).toBe(0.5);
    expect(percentile(1, [])).toBe(0.5);
  });

  it('applies the formula from exactly 10 items', () => {
    expect(percentile(10, sample(10))).toBe(0.95);
  });
});

describe('itemPercentile', () => {
  const window = sample(20);

  it('uses the percentile for hn, devto and github', () => {
    for (const kind of ['hn', 'devto', 'github'] as const) {
      expect(itemPercentile({ kind, engagement: 20, sameKindEngagements: window })).toBe(0.975);
    }
  });

  it('uses the source baseline for rss', () => {
    expect(
      itemPercentile({
        kind: 'rss',
        engagement: 0,
        sameKindEngagements: window,
        baselinePercentile: 0.8,
      }),
    ).toBe(0.8);
  });

  it('falls back to RSS_BASELINE for rss without a source baseline', () => {
    expect(itemPercentile({ kind: 'rss', engagement: 0, sameKindEngagements: window })).toBe(
      RSS_BASELINE,
    );
    expect(
      itemPercentile({
        kind: 'rss',
        engagement: 0,
        sameKindEngagements: window,
        baselinePercentile: null,
      }),
    ).toBe(RSS_BASELINE);
  });

  it('ranks 300 HN points and 300 Dev.to reactions within their own source kind', () => {
    const hnWindow = [...sample(19).map((n) => n * 100), 300];
    const devtoWindow = [...sample(19), 300];
    const hn = itemPercentile({ kind: 'hn', engagement: 300, sameKindEngagements: hnWindow });
    const devto = itemPercentile({
      kind: 'devto',
      engagement: 300,
      sameKindEngagements: devtoWindow,
    });
    expect(devto).toBeGreaterThan(hn);
  });
});

describe('storyPercentile', () => {
  it('is the maximum over the items', () => {
    expect(storyPercentile([0.2, 0.9, 0.5])).toBe(0.9);
  });

  it('is 0 without items', () => {
    expect(storyPercentile([])).toBe(0);
  });
});

describe('rankScore', () => {
  it.each([
    ['P 0.99 at 0 h', 0.99, 0, ['hn'], 35.01],
    ['P 0.99 at 24 h', 0.99, 24, ['hn'], 0.747],
    ['P 0.50 at 2 h', 0.5, 2, ['hn'], 6.31],
    ['P 0.60 (RSS) at 6 h', 0.6, 6, ['rss'], 2.67],
    ['P 0.90 at 10 h with 2 source kinds', 0.9, 10, ['hn', 'devto'], 2.49],
  ] as const)(
    'matches the Appendix B reference value for %s',
    (_name, p, hours, kinds, expected) => {
      const score = rankScore({
        percentile: p,
        publishedAt: hoursAgo(hours),
        now: NOW,
        sourceKinds: kinds,
      });
      expect(Math.abs(score - expected)).toBeLessThan(0.01);
    },
  );

  it('treats a future publishedAt as age 0', () => {
    const input = { percentile: 0.5, now: NOW, sourceKinds: ['hn'] as const };
    expect(rankScore({ ...input, publishedAt: hoursAgo(-5) })).toBe(
      rankScore({ ...input, publishedAt: NOW }),
    );
  });

  it('counts distinct source kinds only', () => {
    const input = { percentile: 0.5, publishedAt: hoursAgo(3), now: NOW };
    const single = rankScore({ ...input, sourceKinds: ['hn'] });
    expect(rankScore({ ...input, sourceKinds: ['hn', 'hn'] })).toBe(single);
    expect(rankScore({ ...input, sourceKinds: ['hn', 'rss', 'devto'] })).toBeCloseTo(
      single * 1.3,
      10,
    );
  });

  it('gives no bonus and no penalty for an empty kind list', () => {
    const input = { percentile: 0.5, publishedAt: hoursAgo(3), now: NOW };
    expect(rankScore({ ...input, sourceKinds: [] })).toBe(
      rankScore({ ...input, sourceKinds: ['hn'] }),
    );
  });

  it('decays with age', () => {
    const input = { percentile: 0.7, now: NOW, sourceKinds: ['hn'] as const };
    expect(rankScore({ ...input, publishedAt: hoursAgo(1) })).toBeGreaterThan(
      rankScore({ ...input, publishedAt: hoursAgo(30) }),
    );
  });
});

describe('topWindowStart', () => {
  it('is seven days before now', () => {
    expect(topWindowStart(new Date('2026-06-08T00:00:00Z')).toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });
});
