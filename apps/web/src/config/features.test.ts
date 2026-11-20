import { describe, expect, it } from 'vitest';
import { FEATURES, isFeatureEnabled, type FeatureFlag } from './features';

describe('FEATURES', () => {
  it('AC-L7 ships with every phase flag off', () => {
    for (const flag of Object.keys(FEATURES) as FeatureFlag[]) {
      expect(isFeatureEnabled(flag)).toBe(false);
    }
  });
});
