import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const validEnv = {
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://devbrief:devbrief@localhost:5432/devbrief',
  INTERNAL_API_TOKEN: 'local-internal-token',
  BETTER_AUTH_SECRET: 'local-dev-better-auth-secret-0123456789',
  GITHUB_CLIENT_ID: 'github-id',
  GITHUB_CLIENT_SECRET: 'github-secret',
  GOOGLE_CLIENT_ID: 'google-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
};

describe('loadEnv', () => {
  it('applies defaults to optional variables', () => {
    expect(loadEnv(validEnv)).toMatchObject({ NODE_ENV: 'development', PORT: 3001 });
  });

  it('coerces PORT to a number', () => {
    expect(loadEnv({ ...validEnv, PORT: '4000' }).PORT).toBe(4000);
  });

  it('reads INGEST_ON_BOOT as a boolean that defaults to false', () => {
    expect(loadEnv(validEnv).INGEST_ON_BOOT).toBe(false);
    expect(loadEnv({ ...validEnv, INGEST_ON_BOOT: 'true' }).INGEST_ON_BOOT).toBe(true);
    expect(() => loadEnv({ ...validEnv, INGEST_ON_BOOT: 'yes' })).toThrow(/INGEST_ON_BOOT/);
  });

  it('names every missing required variable', () => {
    expect(() => loadEnv({})).toThrow(/APP_URL[\s\S]*DATABASE_URL/);
  });

  it('rejects an invalid value', () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('AC-1.5.1 requires the Better Auth secret and both OAuth credentials', () => {
    expect(() => loadEnv({ ...validEnv, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() => loadEnv({ ...validEnv, GITHUB_CLIENT_ID: undefined })).toThrow(/GITHUB_CLIENT_ID/);
    expect(() => loadEnv({ ...validEnv, GOOGLE_CLIENT_SECRET: undefined })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
  });

  it('accepts AUTH_TEST_MODE=true outside production and defaults it to false', () => {
    expect(loadEnv(validEnv).AUTH_TEST_MODE).toBe(false);
    expect(loadEnv({ ...validEnv, AUTH_TEST_MODE: 'true' }).AUTH_TEST_MODE).toBe(true);
  });

  it('rejects AUTH_TEST_MODE=true when NODE_ENV is production', () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'production', AUTH_TEST_MODE: 'true' })).toThrow(
      /AUTH_TEST_MODE/,
    );
    expect(loadEnv({ ...validEnv, NODE_ENV: 'production' }).AUTH_TEST_MODE).toBe(false);
  });
});
