import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFeatureEnabled, type FeatureFlag } from './features';

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

  it('AC-L7 ships with every phase flag off when no NEXT_PUBLIC_FEATURE_* is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_SUMMARIES', undefined);
    vi.stubEnv('NEXT_PUBLIC_FEATURE_PREFERENCES', undefined);
    const features = await loadFeatures();

    expect(features).toEqual(ALL_OFF);
    for (const flag of Object.keys(features) as FeatureFlag[]) {
      expect(isFeatureEnabled(flag, features)).toBe(false);
    }
  });

  it.each([
    ['summaries', 'NEXT_PUBLIC_FEATURE_SUMMARIES'],
    ['preferences', 'NEXT_PUBLIC_FEATURE_PREFERENCES'],
  ])('AC-L7 turns on only %s when %s=true', async (flag, variable) => {
    vi.stubEnv(variable, 'true');
    expect(await loadFeatures()).toEqual({ ...ALL_OFF, [flag]: true });
  });
});
