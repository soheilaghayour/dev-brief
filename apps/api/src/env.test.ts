import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const validEnv = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://devbrief:devbrief@localhost:5432/devbrief',
  INTERNAL_API_TOKEN: 'local-internal-token',
};

describe('loadEnv', () => {
  it('applies defaults to optional variables', () => {
    expect(loadEnv(validEnv)).toMatchObject({ NODE_ENV: 'development', PORT: 3001 });
  });

  it('coerces PORT to a number', () => {
    expect(loadEnv({ ...validEnv, PORT: '4000' }).PORT).toBe(4000);
  });

  it('names every missing required variable', () => {
    expect(() => loadEnv({})).toThrow(/APP_URL[\s\S]*DATABASE_URL/);
  });

  it('rejects an invalid value', () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
