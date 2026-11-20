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

  it('reads the FEATURE_* phase flags as booleans that default to false', () => {
    expect(loadEnv(validEnv)).toMatchObject({
      FEATURE_SUMMARIES: false,
      FEATURE_PREFERENCES: false,
    });
    expect(loadEnv({ ...validEnv, FEATURE_SUMMARIES: 'true' })).toMatchObject({
      FEATURE_SUMMARIES: true,
      FEATURE_PREFERENCES: false,
    });
    expect(loadEnv({ ...validEnv, FEATURE_PREFERENCES: 'true' }).FEATURE_PREFERENCES).toBe(true);
    expect(() => loadEnv({ ...validEnv, FEATURE_SUMMARIES: 'on' })).toThrow(/FEATURE_SUMMARIES/);
    expect(() => loadEnv({ ...validEnv, FEATURE_PREFERENCES: '1' })).toThrow(/FEATURE_PREFERENCES/);
  });

  it('names every missing required variable', () => {
    expect(() => loadEnv({})).toThrow(/APP_URL[\s\S]*DATABASE_URL/);
  });

  it('rejects an invalid value', () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('requires the Better Auth secret and both OAuth credentials', () => {
    expect(() => loadEnv({ ...validEnv, BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
    expect(() => loadEnv({ ...validEnv, GITHUB_CLIENT_ID: undefined })).toThrow(/GITHUB_CLIENT_ID/);
    expect(() => loadEnv({ ...validEnv, GOOGLE_CLIENT_SECRET: undefined })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
  });

  it('accepts AUTH_TEST_MODE=true on a loopback APP_URL and defaults it to false', () => {
    expect(loadEnv(validEnv).AUTH_TEST_MODE).toBe(false);
    for (const APP_URL of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      expect(loadEnv({ ...validEnv, APP_URL, AUTH_TEST_MODE: 'true' }).AUTH_TEST_MODE).toBe(true);
    }
  });

  it('rejects AUTH_TEST_MODE=true on a public APP_URL, whatever NODE_ENV says', () => {
    const publicTestMode = { ...validEnv, APP_URL: 'https://devbrief.dev', AUTH_TEST_MODE: 'true' };
    expect(() => loadEnv(publicTestMode)).toThrow(/AUTH_TEST_MODE: may be true only/);
    for (const NODE_ENV of ['development', 'test', 'production']) {
      expect(() => loadEnv({ ...publicTestMode, NODE_ENV })).toThrow(/AUTH_TEST_MODE/);
    }
    // A host that only starts with "localhost" is not loopback.
    expect(() => loadEnv({ ...publicTestMode, APP_URL: 'https://localhost.devbrief.dev' })).toThrow(
      /AUTH_TEST_MODE/,
    );
  });

  it('rejects AUTH_TEST_MODE=true when NODE_ENV is production', () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: 'production', AUTH_TEST_MODE: 'true' })).toThrow(
      /AUTH_TEST_MODE/,
    );
    expect(loadEnv({ ...validEnv, NODE_ENV: 'production' }).AUTH_TEST_MODE).toBe(false);
  });
});
