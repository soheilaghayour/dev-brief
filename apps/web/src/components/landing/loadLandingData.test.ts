import { afterEach, describe, expect, it, vi } from 'vitest';

const endpoints = vi.hoisted(() => ({
  getFeed: vi.fn(),
  getStats: vi.fn(),
  getExampleBriefings: vi.fn(),
}));
vi.mock('@/lib/api/endpoints', () => endpoints);

import type { StoryCard } from '@devbrief/shared';
import fixture from '@/content/landing-fixture.json';
import { ApiError } from '@/lib/api/apiError';
import { FEATURES } from '@/config/features';
import { sampleExampleBriefings } from './exampleBriefingData';
import { fixtureStories, type FixtureStory } from './landingStories';
import { PREVIEW_MIN_STORIES, loadLandingData } from './loadLandingData';

const COPILOT_ON = { ...FEATURES, copilot: true };
const COPILOT_OFF = { ...FEATURES, copilot: false };

/** Fresh feed cards as the API sends them, with the fields the preview drops. */
function liveStories(count: number): StoryCard[] {
  const [card] = fixtureStories(fixture.items as FixtureStory[], new Date());
  return Array.from({ length: count }, (_, index) => ({
    ...card!,
    id: `live-${index}`,
    excerpt: 'An excerpt the preview never shows.',
    author: 'someone',
    rankScore: count - index,
  }));
}

function liveApi(count = PREVIEW_MIN_STORIES) {
  endpoints.getFeed.mockResolvedValue({ items: liveStories(count), nextCursor: null });
  endpoints.getStats.mockResolvedValue({
    storiesToday: 1,
    sourceCount: 1,
    lastIngestedAt: new Date().toISOString(),
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

function unreachableApi() {
  endpoints.getFeed.mockRejectedValue(new Error('connect ECONNREFUSED'));
  endpoints.getStats.mockRejectedValue(new Error('connect ECONNREFUSED'));
}

describe('loadLandingData', () => {
  it('AC-L2 builds from the sample fixture when the API is unreachable at build time', async () => {
    unreachableApi();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const data = await loadLandingData();
    expect(data.isSample).toBe(true);
    expect(data.stories.length).toBeGreaterThanOrEqual(6);
  });

  it('AC-L2 the sample build embeds the whole 30-story fixture', async () => {
    unreachableApi();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const data = await loadLandingData();
    expect(data.stories).toHaveLength(30);
  });

  it(`AC-L1 embeds live stories once the API has PREVIEW_MIN_STORIES (${PREVIEW_MIN_STORIES}) fresh ones`, async () => {
    liveApi(PREVIEW_MIN_STORIES);
    const data = await loadLandingData(COPILOT_OFF);
    expect(data.isSample).toBe(false);
    expect(data.stories.map((story) => story.id)).toEqual(
      liveStories(PREVIEW_MIN_STORIES).map((story) => story.id),
    );
  });

  it('AC-L1 falls back to the sample below PREVIEW_MIN_STORIES fresh stories', async () => {
    liveApi(PREVIEW_MIN_STORIES - 1);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    const data = await loadLandingData(COPILOT_OFF);
    expect(data.isSample).toBe(true);
  });

  it('AC-L13 embeds up to 30 live stories without the fields the cards do not render', async () => {
    liveApi(40);
    const data = await loadLandingData(COPILOT_OFF);
    expect(data.stories).toHaveLength(30);
    for (const field of ['excerpt', 'author', 'rankScore'])
      expect(data.stories[0]).not.toHaveProperty(field);
  });

  it('AC-L1 falls back below exactly 6 fresh stories', () => {
    expect(PREVIEW_MIN_STORIES).toBe(6);
  });

  it('AC-L14 passes the feature flags on: cluster and summary fields only while their flags are on', async () => {
    const [clusterCard] = fixtureStories(fixture.items as FixtureStory[], new Date()).filter(
      (story) => story.cluster,
    );
    const withExtras = liveStories(PREVIEW_MIN_STORIES).map((story) => ({
      ...story,
      cluster: clusterCard!.cluster,
      hasSummary: true,
      summaryLine: 'A summary line.',
    }));
    endpoints.getFeed.mockResolvedValue({ items: withExtras, nextCursor: null });
    endpoints.getStats.mockResolvedValue(null);

    const off = await loadLandingData({ ...COPILOT_OFF, clusters: false, summaries: false });
    for (const field of ['cluster', 'hasSummary', 'summaryLine'])
      expect(off.stories[0]).not.toHaveProperty(field);

    const on = await loadLandingData({ ...COPILOT_OFF, clusters: true, summaries: true });
    expect(on.stories[0]).toMatchObject({
      cluster: clusterCard!.cluster,
      hasSummary: true,
      summaryLine: 'A summary line.',
    });
  });

  it('fails a revalidation instead of replacing the last good page with the sample', async () => {
    unreachableApi();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-server');
    await expect(loadLandingData()).rejects.toThrow(/too few recent stories/);
  });

  describe('example briefings', () => {
    it('AC-3.2.2 embeds the API examples and does not label them as sample', async () => {
      liveApi();
      const items = sampleExampleBriefings();
      endpoints.getExampleBriefings.mockResolvedValue({ items });
      const data = await loadLandingData(COPILOT_ON);
      expect(data.examples).toEqual(items);
      expect(data.examplesAreSample).toBe(false);
    });

    it('AC-3.2.2 falls back to the sample fixture when the API returns none', async () => {
      liveApi();
      endpoints.getExampleBriefings.mockResolvedValue({ items: [] });
      const data = await loadLandingData(COPILOT_ON);
      expect(data.examplesAreSample).toBe(true);
      expect(data.examples).toEqual(sampleExampleBriefings());
    });

    it('AC-3.2.2 falls back to the sample fixture when the API is unreachable at build time', async () => {
      unreachableApi();
      endpoints.getExampleBriefings.mockRejectedValue(new Error('connect ECONNREFUSED'));
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PHASE', 'phase-production-build');
      const data = await loadLandingData(COPILOT_ON);
      expect(data.examplesAreSample).toBe(true);
      expect(data.examples).toHaveLength(1);
    });

    it('AC-3.2.2 fails a revalidation when the examples call fails, keeping the last good page', async () => {
      liveApi();
      endpoints.getExampleBriefings.mockRejectedValue(new Error('boom'));
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PHASE', 'phase-production-server');
      await expect(loadLandingData(COPILOT_ON)).rejects.toThrow(/example briefings/);
    });

    it('AC-3.2.2 treats a 404 FEATURE_DISABLED answer as none, so a revalidation keeps the stories and shows the sample', async () => {
      liveApi();
      endpoints.getExampleBriefings.mockRejectedValue(
        new ApiError('FEATURE_DISABLED', 'Feature disabled', 'req-1', 404, undefined),
      );
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PHASE', 'phase-production-server');
      const data = await loadLandingData(COPILOT_ON);
      expect(data.isSample).toBe(false);
      expect(data.examplesAreSample).toBe(true);
      expect(data.examples).toEqual(sampleExampleBriefings());
    });

    it('AC-L7 neither fetches nor embeds examples while the copilot flag is off', async () => {
      liveApi();
      const data = await loadLandingData(COPILOT_OFF);
      expect(endpoints.getExampleBriefings).not.toHaveBeenCalled();
      expect(data.examples).toEqual([]);
    });
  });
});
