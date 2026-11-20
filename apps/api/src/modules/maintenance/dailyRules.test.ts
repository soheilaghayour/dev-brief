import { describe, expect, it } from 'vitest';
import {
  aggregateTagStats,
  clusterNeedsUpkeep,
  ingestionRunCutoff,
  llmUsageCutoff,
  planClusterUpkeep,
  rateLimitCounterCutoff,
  storyCutoff,
  tagStatWindowStart,
} from './dailyRules.js';

describe('dailyRules', () => {
  it('AC-1.7.3 recomputes the last 3 UTC days, today included', () => {
    expect(tagStatWindowStart(new Date('2026-03-10T03:15:00Z')).toISOString()).toBe(
      '2026-03-08T00:00:00.000Z',
    );
  });

  it('AC-1.7.3 puts the cutoffs at 90 and 30 days before now', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    expect(storyCutoff(now).toISOString()).toBe('2026-03-03T00:00:00.000Z');
    expect(ingestionRunCutoff(now).toISOString()).toBe('2026-05-02T00:00:00.000Z');
  });

  it('keeps LlmUsage 400 and RateLimitCounter 7 whole UTC days before today', () => {
    const now = new Date('2026-06-01T23:30:00Z');
    expect(llmUsageCutoff(now).toISOString()).toBe('2025-04-27T00:00:00.000Z');
    expect(rateLimitCounterCutoff(now).toISOString()).toBe('2026-05-25T00:00:00.000Z');
  });

  it('AC-1.7.3 buckets by UTC publish day and sums the max item engagement per story', () => {
    const rows = aggregateTagStats([
      {
        publishedAt: new Date('2026-03-09T23:30:00Z'),
        tags: ['rust', 'rust', 'go'],
        engagementPercentile: 0.8,
        itemEngagements: [10, 40],
      },
      {
        publishedAt: new Date('2026-03-09T01:00:00Z'),
        tags: ['rust'],
        engagementPercentile: 0.4,
        itemEngagements: [5],
      },
      {
        publishedAt: new Date('2026-03-10T00:00:00Z'),
        tags: ['rust'],
        engagementPercentile: 0.5,
        itemEngagements: [],
      },
    ]);
    const rust = rows.find((row) => row.tag === 'rust' && row.day.getUTCDate() === 9);
    expect(rust).toMatchObject({ storyCount: 2, engagementSum: 45 });
    expect(rust?.avgPercentile).toBeCloseTo(0.6);
    expect(rows).toHaveLength(3);
  });

  it('§5.3 re-picks the representative among the remaining members and recounts their kinds', () => {
    const upkeep = planClusterUpkeep('c1', [
      { id: 'a', rankScore: 3, kinds: ['hn', 'rss'] },
      { id: 'b', rankScore: 5, kinds: ['rss'] },
      { id: 'c', rankScore: 5, kinds: ['devto'] },
    ]);
    expect(upkeep).toEqual({
      action: 'update',
      clusterId: 'c1',
      memberCount: 3,
      sourceKinds: ['devto', 'hn', 'rss'],
      representativeStoryId: 'c',
      rankScore: 5,
    });
  });

  it('§5.3 dissolves a cluster left with one member or none', () => {
    expect(planClusterUpkeep('c1', [{ id: 'a', rankScore: 3, kinds: ['hn'] }])).toEqual({
      action: 'dissolve',
      clusterId: 'c1',
    });
    expect(planClusterUpkeep('c1', [])).toEqual({
      action: 'dissolve',
      clusterId: 'c1',
    });
  });

  it('§5.3 flags a cluster that is short of members, miscounted, or without exactly the representative as primary', () => {
    const ok = {
      representativeStoryId: 'a',
      memberCount: 2,
      members: [
        { id: 'a', isPrimary: true },
        { id: 'b', isPrimary: false },
      ],
    };
    expect(clusterNeedsUpkeep(ok)).toBe(false);
    expect(clusterNeedsUpkeep({ ...ok, representativeStoryId: 'gone' })).toBe(true);
    expect(clusterNeedsUpkeep({ ...ok, memberCount: 3 })).toBe(true);
    expect(clusterNeedsUpkeep({ ...ok, members: [{ id: 'a', isPrimary: true }] })).toBe(true);
    expect(
      clusterNeedsUpkeep({ ...ok, members: ok.members.map((m) => ({ ...m, isPrimary: false })) }),
    ).toBe(true);
    expect(
      clusterNeedsUpkeep({ ...ok, members: ok.members.map((m) => ({ ...m, isPrimary: true })) }),
    ).toBe(true);
  });
});
