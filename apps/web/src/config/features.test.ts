import { afterEach, describe, expect, it, vi } from 'vitest';
import { FEATURES, isFeatureEnabled, type FeatureFlag } from './features';

const ALL_OFF = {
  clusters: false,
  summaries: false,
  preferences: false,
  copilot: false,
  radar: false,
  collections: false,
};

/** Evaluates features.ts afresh, so it reads the env stubbed for this test. */
async function loadFeatures() {
  vi.resetModules();
  return (await import('./features')).FEATURES;
}

describe('FEATURES', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AC-L7 ships with every phase flag off', () => {
    for (const flag of Object.keys(FEATURES) as FeatureFlag[]) {
      expect(isFeatureEnabled(flag)).toBe(false);
    }
  });

  it('AC-L7 leaves every flag off when no NEXT_PUBLIC_FEATURE_* is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SUMMARIES', undefined);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PREFERENCES', undefined);
    expect(await loadFeatures()).toEqual(ALL_OFF);
  });

  it('AC-L7 turns on only summaries when NEXT_PUBLIC_FEATURE_SUMMARIES=true', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SUMMARIES', 'true');
    expect(await loadFeatures()).toEqual({ ...ALL_OFF, summaries: true });
  });

  it('turns on only preferences when NEXT_PUBLIC_FEATURE_PREFERENCES=true', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PREFERENCES', 'true');
    expect(await loadFeatures()).toEqual({ ...ALL_OFF, preferences: true });
  });
});
