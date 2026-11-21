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
  it("AC-1.7.8 accepts 'true', 'false' or unset for each FEATURE_* flag and returns all four", () => {
    expect(validateFeatureFlagEnv({})).toEqual({
      FEATURE_SUMMARIES: 'false',
      FEATURE_CLUSTERS: 'false',
      FEATURE_COPILOT: 'false',
      FEATURE_COLLECTIONS: 'false',
    });
    expect(
      validateFeatureFlagEnv({
        FEATURE_SUMMARIES: 'true',
        FEATURE_CLUSTERS: 'false',
        FEATURE_COPILOT: 'true',
        FEATURE_COLLECTIONS: 'true',
      }),
    ).toEqual({
      FEATURE_SUMMARIES: 'true',
      FEATURE_CLUSTERS: 'false',
      FEATURE_COPILOT: 'true',
      FEATURE_COLLECTIONS: 'true',
    });
  });

  it('AC-1.7.8 rejects FEATURE_COPILOT=yes and the other values the API also rejects', () => {
    for (const value of ['yes', 'TRUE', '1', '']) {
      for (const flag of [
        'FEATURE_SUMMARIES',
        'FEATURE_CLUSTERS',
        'FEATURE_COPILOT',
        'FEATURE_COLLECTIONS',
      ]) {
        expect(() => validateFeatureFlagEnv({ [flag]: value })).toThrow(new RegExp(flag));
      }
    }
  });

  it('AC-1.7.8 leaves out radar and preferences, which have no flag', () => {
    const flags = validateFeatureFlagEnv({ FEATURE_RADAR: 'yes', FEATURE_PREFERENCES: 'yes' });
    expect(Object.keys(flags)).not.toContain('FEATURE_RADAR');
    expect(Object.keys(flags)).not.toContain('FEATURE_PREFERENCES');
  });
});
