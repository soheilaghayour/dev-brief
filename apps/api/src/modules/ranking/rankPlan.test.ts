import { rankScore, RSS_BASELINE } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { planRankUpdates, type RankItem, type RankStory } from './rankPlan.js';

const NOW = new Date('2026-03-10T12:00:00Z');
const PUBLISHED = new Date('2026-03-10T06:00:00Z');

function item(id: string, overrides: Partial<RankItem> = {}): RankItem {
  return {
    id,
    kind: 'hn',
    baselinePercentile: null,
    points: 0,
    commentsCount: null,
    reactionsCount: null,
    stars: null,
    ...overrides,
  };
}

function story(id: string, items: RankItem[], clusterId: string | null = null): RankStory {
  return { id, publishedAt: PUBLISHED, items, clusterId };
}

describe('planRankUpdates', () => {
  it('AC-1.2.10 uses 0.5 below the small-sample guard and ranks by percentile from 10 items', () => {
    const few = [item('a', { points: 5 }), item('b', { points: 1 })];
    const small = planRankUpdates({
      stories: [story('s', [few[0]!])],
      populationItems: few,
      now: NOW,
    });
    expect(small.items[0]?.percentile).toBe(0.5);

    const many = Array.from({ length: 10 }, (_, index) => item(`i${index}`, { points: index }));
    const large = planRankUpdates({
      stories: [story('top', [many[9]!])],
      populationItems: many,
      now: NOW,
    });
    expect(large.items[0]?.percentile).toBe(0.95);
    expect(large.stories[0]?.engagementPercentile).toBe(0.95);
  });

  it('AC-1.2.10 gives RSS items the source baseline or RSS_BASELINE', () => {
    const rss = item('r', { kind: 'rss' });
    const custom = item('c', { kind: 'rss', baselinePercentile: 0.3 });
    const plan = planRankUpdates({
      stories: [story('s1', [rss]), story('s2', [custom])],
      populationItems: [rss, custom],
      now: NOW,
    });
    expect(plan.items.map((entry) => entry.percentile)).toEqual([RSS_BASELINE, 0.3]);
  });

  it('AC-1.2.10 takes the story percentile from its best item and adds the k = 2 bonus', () => {
    const hn = item('h', { points: 5 });
    const rss = item('r', { kind: 'rss' });
    const plan = planRankUpdates({
      stories: [story('s', [hn, rss])],
      populationItems: [hn, rss],
      now: NOW,
    });
    expect(plan.stories[0]?.engagementPercentile).toBe(RSS_BASELINE);
    expect(plan.stories[0]?.rankScore).toBe(
      rankScore({
        percentile: RSS_BASELINE,
        publishedAt: PUBLISHED,
        now: NOW,
        sourceKinds: ['hn', 'rss'],
      }),
    );
  });

  it('AC-2.1.7 counts k over the cluster, so a single-kind member carries the cluster bonus', () => {
    const hn = item('h', { points: 5 });
    const rss = item('r', { kind: 'rss' });
    const plan = planRankUpdates({
      stories: [story('a', [hn], 'c1'), story('b', [rss], 'c1')],
      populationItems: [hn, rss],
      clusters: [{ id: 'c1', sourceKinds: ['hn', 'rss'] }],
      now: NOW,
    });
    expect(plan.stories[0]?.rankScore).toBe(
      rankScore({ percentile: 0.5, publishedAt: PUBLISHED, now: NOW, sourceKinds: ['hn', 'rss'] }),
    );
    const alone = planRankUpdates({
      stories: [story('a', [hn])],
      populationItems: [hn, rss],
      now: NOW,
    });
    expect(plan.stories[0]?.rankScore).toBeGreaterThan(alone.stories[0]?.rankScore ?? Infinity);
  });

  it('AC-2.1.7 makes the highest-scored member the representative and the cluster rank its score', () => {
    const strong = item('strong', { points: 500 });
    const weak = item('weak', { points: 1 });
    const population = [
      strong,
      weak,
      ...Array.from({ length: 10 }, (_, n) => item(`p${n}`, { points: n })),
    ];
    const stories = [story('a', [weak], 'c1'), story('b', [strong], 'c1')];
    const clusters = [{ id: 'c1', sourceKinds: ['hn' as const] }];
    const plan = planRankUpdates({ stories, populationItems: population, clusters, now: NOW });
    const winner = plan.stories.find((entry) => entry.id === 'b');
    expect(plan.clusters).toEqual([
      { id: 'c1', representativeStoryId: 'b', rankScore: winner?.rankScore },
    ]);

    // Engagement swaps: the other member is now the stronger one.
    const swapped = planRankUpdates({
      stories: [story('a', [strong], 'c1'), story('b', [weak], 'c1')],
      populationItems: population,
      clusters,
      now: NOW,
    });
    expect(swapped.clusters[0]?.representativeStoryId).toBe('a');
  });

  it('AC-2.1.7 breaks a score tie by id desc and lets an out-of-window member win', () => {
    const tied = planRankUpdates({
      stories: [story('a', [item('x')], 'c1'), story('b', [item('y')], 'c1')],
      populationItems: [],
      clusters: [{ id: 'c1', sourceKinds: ['hn'] }],
      now: NOW,
    });
    expect(tied.clusters[0]?.representativeStoryId).toBe('b');

    const withOutside = planRankUpdates({
      stories: [story('a', [item('x')], 'c1')],
      populationItems: [],
      clusters: [{ id: 'c1', sourceKinds: ['hn'] }],
      outsideMembers: [{ id: 'old', clusterId: 'c1', rankScore: 1e9 }],
      now: NOW,
    });
    expect(withOutside.clusters[0]).toEqual({
      id: 'c1',
      representativeStoryId: 'old',
      rankScore: 1e9,
    });
  });
});
