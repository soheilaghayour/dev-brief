import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES, featuresFromEnv, isFeatureEnabled, type FeatureFlag } from './features';

const ALL_OFF = {
  clusters: false,
  summaries: false,
  preferences: false,
  copilot: false,
  radar: false,
  collections: false,
};

describe('FEATURES', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('AC-L7 ships with every phase flag off', () => {
    for (const flag of Object.keys(FEATURES) as FeatureFlag[]) {
      expect(isFeatureEnabled(flag)).toBe(false);
    }
  });

  it('AC-L7 leaves every flag off when no NEXT_PUBLIC_FEATURE_* is set', () => {
    expect(featuresFromEnv({})).toEqual(ALL_OFF);
  });

  it('AC-L7 turns on only summaries when NEXT_PUBLIC_FEATURE_SUMMARIES=true', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SUMMARIES', 'true');
    const { FEATURES: built } = await import('./features');
    expect(built).toEqual({ ...ALL_OFF, summaries: true });
  });

  it('turns on preferences only for the exact value true', () => {
    expect(featuresFromEnv({ NEXT_PUBLIC_FEATURE_PREFERENCES: 'true' })).toEqual({
      ...ALL_OFF,
      preferences: true,
    });
    for (const value of ['TRUE', '1', 'yes', '']) {
      expect(featuresFromEnv({ NEXT_PUBLIC_FEATURE_PREFERENCES: value }).preferences).toBe(false);
    }
  });
});
