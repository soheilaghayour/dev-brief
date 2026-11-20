import { rankScore, RSS_BASELINE, type SourceKind } from '@devbrief/shared';
import { describe, expect, it } from 'vitest';
import { planRankUpdates, type RankCluster, type RankItem, type RankStory } from './rankPlan.js';

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

function member(id: string, kinds: SourceKind[], isPrimary = false) {
  return { id, isPrimary, kinds };
}

function cluster(
  id: string,
  members: RankCluster['members'],
  sourceKinds: SourceKind[] = ['hn'],
  representativeStoryId = members.find((m) => m.isPrimary)?.id ?? '',
  rankScore = 0,
): RankCluster {
  return { id, sourceKinds, representativeStoryId, rankScore, members };
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
      clusters: [cluster('c1', [member('a', ['hn']), member('b', ['rss'])])],
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

  it('AC-2.1.7 derives k and sourceKinds from the members current kinds, not the stored ones', () => {
    const hn = item('h', { points: 5 });
    const plan = planRankUpdates({
      stories: [story('a', [hn], 'c1')],
      populationItems: [hn],
      // Stored kinds are stale: a Dev.to cross-post joined member b later.
      clusters: [cluster('c1', [member('a', ['hn']), member('b', ['devto'])], ['hn'])],
      now: NOW,
    });
    expect(plan.stories[0]?.rankScore).toBe(
      rankScore({
        percentile: 0.5,
        publishedAt: PUBLISHED,
        now: NOW,
        sourceKinds: ['devto', 'hn'],
      }),
    );
    expect(plan.clusters[0]).toMatchObject({ sourceKinds: ['devto', 'hn'], stale: true });
  });

  it('AC-2.1.7 makes the highest-scored member the representative and the cluster rank its score', () => {
    const strong = item('strong', { points: 500 });
    const weak = item('weak', { points: 1 });
    const population = [
      strong,
      weak,
      ...Array.from({ length: 10 }, (_, n) => item(`p${n}`, { points: n })),
    ];
    const clusters = [cluster('c1', [member('a', ['hn']), member('b', ['hn'], true)])];
    const plan = planRankUpdates({
      stories: [story('a', [weak], 'c1'), story('b', [strong], 'c1')],
      populationItems: population,
      clusters,
      now: NOW,
    });
    const winner = plan.stories.find((entry) => entry.id === 'b');
    expect(plan.clusters).toEqual([
      expect.objectContaining({
        id: 'c1',
        representativeStoryId: 'b',
        rankScore: winner?.rankScore,
        flips: [],
      }),
    ]);

    // Engagement swaps: the other member is now the stronger one, and exactly the two flip.
    const swapped = planRankUpdates({
      stories: [story('a', [strong], 'c1'), story('b', [weak], 'c1')],
      populationItems: population,
      clusters,
      now: NOW,
    });
    expect(swapped.clusters[0]?.representativeStoryId).toBe('a');
    expect(swapped.clusters[0]?.flips).toEqual([
      { id: 'a', isPrimary: true },
      { id: 'b', isPrimary: false },
    ]);
  });

  it('AC-2.1.7 breaks a score tie by id desc', () => {
    const tied = planRankUpdates({
      stories: [story('a', [item('x')], 'c1'), story('b', [item('y')], 'c1')],
      populationItems: [],
      clusters: [cluster('c1', [member('a', ['hn']), member('b', ['hn'])])],
      now: NOW,
    });
    expect(tied.clusters[0]?.representativeStoryId).toBe('b');
  });

  it('AC-2.1.7 lets only in-window members compete, so Top never loses the cluster', () => {
    // A is past the window with a high stored score; B is in it. A must not be the representative.
    const plan = planRankUpdates({
      stories: [story('b', [item('y', { points: 30 })], 'c1')],
      populationItems: [],
      clusters: [cluster('c1', [member('a', ['hn'], true), member('b', ['hn'])], ['hn'], 'a', 1e9)],
      now: NOW,
    });
    expect(plan.clusters[0]).toMatchObject({
      representativeStoryId: 'b',
      flips: [
        { id: 'a', isPrimary: false },
        { id: 'b', isPrimary: true },
      ],
    });
  });

  it('AC-2.1.7 plans no cluster for a cluster with no member in the window', () => {
    const plan = planRankUpdates({
      stories: [],
      populationItems: [],
      clusters: [cluster('c1', [member('a', ['hn'], true), member('b', ['hn'])])],
      now: NOW,
    });
    expect(plan.clusters).toEqual([]);
  });
});
