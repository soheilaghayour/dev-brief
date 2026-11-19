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

function story(id: string, items: RankItem[]): RankStory {
  return { id, publishedAt: PUBLISHED, items };
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
});
