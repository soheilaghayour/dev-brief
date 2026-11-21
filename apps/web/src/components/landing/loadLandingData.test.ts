import { afterEach, describe, expect, it, vi } from 'vitest';

const endpoints = vi.hoisted(() => ({
  getFeed: vi.fn(),
  getStats: vi.fn(),
  getExampleBriefings: vi.fn(),
}));
vi.mock('@/lib/api/endpoints', () => endpoints);

import fixture from '@/content/landing-fixture.json';
import { FEATURES } from '@/config/features';
import { sampleExampleBriefings } from './exampleBriefingData';
import { fixtureStories, type FixtureStory } from './landingStories';
import { loadLandingData } from './loadLandingData';

const COPILOT_ON = { ...FEATURES, copilot: true };
const COPILOT_OFF = { ...FEATURES, copilot: false };

function liveApi() {
  const [story] = fixtureStories(fixture.items as FixtureStory[], new Date());
  endpoints.getFeed.mockResolvedValue({
    items: Array.from({ length: 6 }, () => story),
    nextCursor: null,
  });
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

    it('AC-L7 neither fetches nor embeds examples while the copilot flag is off', async () => {
      liveApi();
      const data = await loadLandingData(COPILOT_OFF);
      expect(endpoints.getExampleBriefings).not.toHaveBeenCalled();
      expect(data.examples).toEqual([]);
    });
  });
});
