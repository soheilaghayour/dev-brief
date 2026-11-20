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

const SUMMARIES_SECRETS = {
  ANTHROPIC_API_KEY: 'test-key',
  IP_HASH_SECRET: 'local-ip-hash-secret-0123456789abcdef',
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

  it('defaults INGEST_SCHEDULE to on in production and off elsewhere, and an explicit value wins', () => {
    expect(loadEnv(validEnv).INGEST_SCHEDULE).toBe(false);
    expect(loadEnv({ ...validEnv, NODE_ENV: 'test' }).INGEST_SCHEDULE).toBe(false);
    expect(loadEnv({ ...validEnv, NODE_ENV: 'production' }).INGEST_SCHEDULE).toBe(true);
    expect(
      loadEnv({ ...validEnv, NODE_ENV: 'production', INGEST_SCHEDULE: 'false' }).INGEST_SCHEDULE,
    ).toBe(false);
    expect(loadEnv({ ...validEnv, INGEST_SCHEDULE: 'true' }).INGEST_SCHEDULE).toBe(true);
    expect(() => loadEnv({ ...validEnv, INGEST_SCHEDULE: 'yes' })).toThrow(/INGEST_SCHEDULE/);
  });

  it('reads the FEATURE_* phase flags as booleans that default to false', () => {
    expect(loadEnv(validEnv)).toMatchObject({
      FEATURE_SUMMARIES: false,
      FEATURE_PREFERENCES: false,
      FEATURE_CLUSTERS: false,
      FEATURE_COPILOT: false,
      FEATURE_RADAR: false,
      FEATURE_COLLECTIONS: false,
    });
    expect(loadEnv({ ...validEnv, FEATURE_SUMMARIES: 'true', ...SUMMARIES_SECRETS })).toMatchObject(
      {
        FEATURE_SUMMARIES: true,
        FEATURE_PREFERENCES: false,
      },
    );
    expect(loadEnv({ ...validEnv, FEATURE_PREFERENCES: 'true' }).FEATURE_PREFERENCES).toBe(true);
    expect(() => loadEnv({ ...validEnv, FEATURE_SUMMARIES: 'on' })).toThrow(/FEATURE_SUMMARIES/);
    expect(() => loadEnv({ ...validEnv, FEATURE_PREFERENCES: '1' })).toThrow(/FEATURE_PREFERENCES/);
  });

  it('reads AUTO_SUMMARIES as a boolean that defaults to false, so a summaries-on API makes no auto calls unasked', () => {
    const summariesOn = { ...validEnv, FEATURE_SUMMARIES: 'true', ...SUMMARIES_SECRETS };
    expect(loadEnv(summariesOn).AUTO_SUMMARIES).toBe(false);
    expect(loadEnv({ ...summariesOn, AUTO_SUMMARIES: 'true' }).AUTO_SUMMARIES).toBe(true);
    expect(() => loadEnv({ ...summariesOn, AUTO_SUMMARIES: 'yes' })).toThrow(/AUTO_SUMMARIES/);
  });

  it('reads AUTO_CLUSTERING as a boolean that defaults to false, so a clusters-on API makes no clustering calls unasked', () => {
    const clustersOn = { ...validEnv, FEATURE_CLUSTERS: 'true', ANTHROPIC_API_KEY: 'test-key' };
    expect(loadEnv(clustersOn).AUTO_CLUSTERING).toBe(false);
    expect(loadEnv({ ...clustersOn, AUTO_CLUSTERING: 'true' }).AUTO_CLUSTERING).toBe(true);
    expect(() => loadEnv({ ...clustersOn, AUTO_CLUSTERING: 'yes' })).toThrow(/AUTO_CLUSTERING/);
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

  it('reads an unset or empty GITHUB_TOKEN as missing', () => {
    expect(loadEnv(validEnv).GITHUB_TOKEN).toBeUndefined();
    expect(loadEnv({ ...validEnv, GITHUB_TOKEN: '' }).GITHUB_TOKEN).toBeUndefined();
    expect(loadEnv({ ...validEnv, GITHUB_TOKEN: 'github_pat_x' }).GITHUB_TOKEN).toBe(
      'github_pat_x',
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

  it('requires ANTHROPIC_API_KEY only when an LLM feature flag (FEATURE_SUMMARIES, FEATURE_CLUSTERS or FEATURE_COPILOT) is on', () => {
    expect(loadEnv(validEnv).ANTHROPIC_API_KEY).toBeUndefined();
    expect(() => loadEnv({ ...validEnv, FEATURE_SUMMARIES: 'true' })).toThrow(
      /ANTHROPIC_API_KEY: is required when FEATURE_SUMMARIES=true, FEATURE_CLUSTERS=true or FEATURE_COPILOT=true/,
    );
    expect(() =>
      loadEnv({ ...validEnv, FEATURE_SUMMARIES: 'true', ANTHROPIC_API_KEY: '' }),
    ).toThrow(/ANTHROPIC_API_KEY/);
    expect(
      loadEnv({ ...validEnv, FEATURE_SUMMARIES: 'true', ...SUMMARIES_SECRETS }).ANTHROPIC_API_KEY,
    ).toBe('test-key');
  });

  it('requires ANTHROPIC_API_KEY when FEATURE_CLUSTERS=true', () => {
    expect(() => loadEnv({ ...validEnv, FEATURE_CLUSTERS: 'true' })).toThrow(
      /ANTHROPIC_API_KEY: is required when FEATURE_SUMMARIES=true, FEATURE_CLUSTERS=true or FEATURE_COPILOT=true/,
    );
    expect(
      loadEnv({ ...validEnv, FEATURE_CLUSTERS: 'true', ANTHROPIC_API_KEY: 'test-key' })
        .FEATURE_CLUSTERS,
    ).toBe(true);
    expect(() => loadEnv({ ...validEnv, FEATURE_CLUSTERS: 'on' })).toThrow(/FEATURE_CLUSTERS/);
  });

  it('refuses to boot with FEATURE_COPILOT=true and no ANTHROPIC_API_KEY or no IP_HASH_SECRET', () => {
    const copilotOn = { ...validEnv, FEATURE_COPILOT: 'true' };
    expect(() =>
      loadEnv({ ...copilotOn, IP_HASH_SECRET: SUMMARIES_SECRETS.IP_HASH_SECRET }),
    ).toThrow(/ANTHROPIC_API_KEY: is required when .*FEATURE_COPILOT=true/);
    expect(() => loadEnv({ ...copilotOn, ANTHROPIC_API_KEY: 'test-key' })).toThrow(
      /IP_HASH_SECRET: is required when .*FEATURE_COPILOT=true/,
    );
    expect(loadEnv({ ...copilotOn, ...SUMMARIES_SECRETS }).FEATURE_COPILOT).toBe(true);
  });

  it('reads FEATURE_RADAR and FEATURE_COLLECTIONS without any LLM secret and rejects other values', () => {
    expect(loadEnv({ ...validEnv, FEATURE_RADAR: 'true' }).FEATURE_RADAR).toBe(true);
    expect(loadEnv({ ...validEnv, FEATURE_COLLECTIONS: 'true' }).FEATURE_COLLECTIONS).toBe(true);
    expect(() => loadEnv({ ...validEnv, FEATURE_COPILOT: 'on' })).toThrow(/FEATURE_COPILOT/);
    expect(() => loadEnv({ ...validEnv, FEATURE_RADAR: '1' })).toThrow(/FEATURE_RADAR/);
    expect(() => loadEnv({ ...validEnv, FEATURE_COLLECTIONS: 'TRUE' })).toThrow(
      /FEATURE_COLLECTIONS/,
    );
  });

  it('requires IP_HASH_SECRET of 32+ characters when summaries or copilot is on', () => {
    const summariesOn = { ...validEnv, FEATURE_SUMMARIES: 'true', ANTHROPIC_API_KEY: 'test-key' };
    expect(loadEnv(validEnv).IP_HASH_SECRET).toBeUndefined();
    expect(() => loadEnv(summariesOn)).toThrow(
      /IP_HASH_SECRET: is required when FEATURE_SUMMARIES=true or FEATURE_COPILOT=true/,
    );
    expect(() => loadEnv({ ...summariesOn, IP_HASH_SECRET: 'too-short' })).toThrow(
      /IP_HASH_SECRET/,
    );
    expect(loadEnv({ ...summariesOn, ...SUMMARIES_SECRETS }).IP_HASH_SECRET).toBe(
      SUMMARIES_SECRETS.IP_HASH_SECRET,
    );
  });

  it('reads LLM_MODEL with the Haiku 5.5 default', () => {
    expect(loadEnv(validEnv).LLM_MODEL).toBe('claude-haiku-5-5');
    expect(loadEnv({ ...validEnv, LLM_MODEL: 'other-model' }).LLM_MODEL).toBe('other-model');
  });

  it('reads the LLM caps and prices as numbers, unset when absent or empty', () => {
    expect(loadEnv(validEnv).LLM_CAP_GLOBAL_USD_DAY).toBeUndefined();
    expect(loadEnv(validEnv).LLM_PRICE_INPUT_PER_MTOK).toBeUndefined();
    expect(
      loadEnv({ ...validEnv, LLM_CAP_GLOBAL_USD_DAY: '' }).LLM_CAP_GLOBAL_USD_DAY,
    ).toBeUndefined();
    expect(
      loadEnv({
        ...validEnv,
        LLM_CAP_SUMMARY_AUTO_USD_DAY: '0.02',
        LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY: '0',
        LLM_CAP_CLUSTER_USD_DAY: '0.005',
        LLM_CAP_COPILOT_USD_DAY: '0.03',
        LLM_CAP_GLOBAL_USD_DAY: '0.07',
        LLM_PRICE_INPUT_PER_MTOK: '0.2',
        LLM_PRICE_OUTPUT_PER_MTOK: '1',
      }),
    ).toMatchObject({
      LLM_CAP_SUMMARY_AUTO_USD_DAY: 0.02,
      LLM_CAP_SUMMARY_ON_DEMAND_USD_DAY: 0,
      LLM_CAP_CLUSTER_USD_DAY: 0.005,
      LLM_CAP_COPILOT_USD_DAY: 0.03,
      LLM_CAP_GLOBAL_USD_DAY: 0.07,
      LLM_PRICE_INPUT_PER_MTOK: 0.2,
      LLM_PRICE_OUTPUT_PER_MTOK: 1,
    });
  });

  it('rejects an invalid LLM cap or price', () => {
    for (const value of ['abc', '-0.01', 'Infinity']) {
      expect(() => loadEnv({ ...validEnv, LLM_CAP_GLOBAL_USD_DAY: value })).toThrow(
        /LLM_CAP_GLOBAL_USD_DAY/,
      );
    }
    expect(() => loadEnv({ ...validEnv, LLM_CAP_SUMMARY_AUTO_USD_DAY: 'lots' })).toThrow(
      /LLM_CAP_SUMMARY_AUTO_USD_DAY/,
    );
    expect(() => loadEnv({ ...validEnv, LLM_PRICE_OUTPUT_PER_MTOK: '0' })).toThrow(
      /LLM_PRICE_OUTPUT_PER_MTOK/,
    );
  });
});
