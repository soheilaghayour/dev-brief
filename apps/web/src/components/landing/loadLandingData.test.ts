import { afterEach, describe, expect, it, vi } from 'vitest';

const endpoints = vi.hoisted(() => ({ getFeed: vi.fn(), getStats: vi.fn() }));
vi.mock('@/lib/api/endpoints', () => endpoints);

import { loadLandingData } from './loadLandingData';

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
});
