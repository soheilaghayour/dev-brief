import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const validEnv = {
  APP_URL: 'http://localhost:3000',
  API_INTERNAL_URL: 'http://localhost:3001',
  INTERNAL_API_TOKEN: 'local-internal-token',
};

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
