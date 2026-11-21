import { afterEach, describe, expect, it, vi } from 'vitest';

describe('next.config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('AC-1.7.8 passes the four validated flags to the build through env', async () => {
    vi.stubEnv('FEATURE_COPILOT', 'true');
    vi.stubEnv('FEATURE_SUMMARIES', undefined);
    vi.stubEnv('FEATURE_CLUSTERS', undefined);
    vi.stubEnv('FEATURE_COLLECTIONS', undefined);
    const config = (await import('../../next.config')).default;

    expect(config.env).toMatchObject({
      FEATURE_SUMMARIES: 'false',
      FEATURE_CLUSTERS: 'false',
      FEATURE_COPILOT: 'true',
      FEATURE_COLLECTIONS: 'false',
    });
  });
});
