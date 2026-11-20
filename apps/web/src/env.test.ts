import { describe, expect, it } from 'vitest';
import { loadAppOrigin, loadEnv, validateFeatureFlagEnv } from './env';

const validEnv = {
  APP_URL: 'http://localhost:3000',
  API_INTERNAL_URL: 'http://localhost:3001',
  INTERNAL_API_TOKEN: 'local-internal-token',
};

describe('loadAppOrigin', () => {
  it('reads the origin from APP_URL', () => {
    expect(loadAppOrigin({ APP_URL: 'https://devbrief.example/path' }).origin).toBe(
      'https://devbrief.example',
    );
  });

  it('falls back to the local default when APP_URL is missing', () => {
    expect(loadAppOrigin({}).origin).toBe('http://localhost:3000');
  });
});

describe('loadEnv', () => {
  it('applies defaults to optional variables', () => {
    expect(loadEnv(validEnv).NODE_ENV).toBe('development');
  });

  it('names every missing required variable', () => {
    expect(() => loadEnv({})).toThrow(/APP_URL[\s\S]*API_INTERNAL_URL/);
  });

  it('rejects an invalid value', () => {
    expect(() => loadEnv({ ...validEnv, API_INTERNAL_URL: 'not a url' })).toThrow(
      /API_INTERNAL_URL/,
    );
  });
});

describe('validateFeatureFlagEnv', () => {
  it("accepts 'true', 'false' or unset for each NEXT_PUBLIC_FEATURE_* flag", () => {
    expect(() => validateFeatureFlagEnv({})).not.toThrow();
    expect(() =>
      validateFeatureFlagEnv({
        NEXT_PUBLIC_FEATURE_SUMMARIES: 'true',
        NEXT_PUBLIC_FEATURE_PREFERENCES: 'false',
        NEXT_PUBLIC_FEATURE_CLUSTERS: 'true',
        NEXT_PUBLIC_FEATURE_COPILOT: 'true',
        NEXT_PUBLIC_FEATURE_RADAR: 'false',
        NEXT_PUBLIC_FEATURE_COLLECTIONS: 'true',
      }),
    ).not.toThrow();
  });

  it('rejects the values the API also rejects instead of reading them as off', () => {
    for (const value of ['TRUE', '1', 'yes', '']) {
      expect(() => validateFeatureFlagEnv({ NEXT_PUBLIC_FEATURE_SUMMARIES: value })).toThrow(
        /NEXT_PUBLIC_FEATURE_SUMMARIES/,
      );
      expect(() => validateFeatureFlagEnv({ NEXT_PUBLIC_FEATURE_PREFERENCES: value })).toThrow(
        /NEXT_PUBLIC_FEATURE_PREFERENCES/,
      );
      expect(() => validateFeatureFlagEnv({ NEXT_PUBLIC_FEATURE_CLUSTERS: value })).toThrow(
        /NEXT_PUBLIC_FEATURE_CLUSTERS/,
      );
      expect(() => validateFeatureFlagEnv({ NEXT_PUBLIC_FEATURE_COPILOT: value })).toThrow(
        /NEXT_PUBLIC_FEATURE_COPILOT/,
      );
      expect(() => validateFeatureFlagEnv({ NEXT_PUBLIC_FEATURE_RADAR: value })).toThrow(
        /NEXT_PUBLIC_FEATURE_RADAR/,
      );
      expect(() => validateFeatureFlagEnv({ NEXT_PUBLIC_FEATURE_COLLECTIONS: value })).toThrow(
        /NEXT_PUBLIC_FEATURE_COLLECTIONS/,
      );
    }
  });
});
