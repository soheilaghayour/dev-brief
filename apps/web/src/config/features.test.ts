import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFeatureEnabled, type FeatureFlag } from './features';

const ALL_OFF = { clusters: false, summaries: false, copilot: false, collections: false };

/** Evaluates features.ts afresh, so it reads the env stubbed for this test. */
async function loadFeatures() {
  vi.resetModules();
  return (await import('./features')).FEATURES;
}

describe('FEATURES', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AC-1.7.8 has exactly the four remaining flags', async () => {
    expect(Object.keys(await loadFeatures()).sort()).toEqual([
      'clusters',
      'collections',
      'copilot',
      'summaries',
    ]);
  });

  it('AC-L7 ships with every flag off when no FEATURE_* is set', async () => {
    vi.stubEnv('FEATURE_SUMMARIES', undefined);
    vi.stubEnv('FEATURE_CLUSTERS', undefined);
    vi.stubEnv('FEATURE_COPILOT', undefined);
    vi.stubEnv('FEATURE_COLLECTIONS', undefined);
    const features = await loadFeatures();

    expect(features).toEqual(ALL_OFF);
    for (const flag of Object.keys(features) as FeatureFlag[]) {
      expect(isFeatureEnabled(flag, features)).toBe(false);
    }
  });

  it.each([
    ['summaries', 'FEATURE_SUMMARIES'],
    ['clusters', 'FEATURE_CLUSTERS'],
    ['copilot', 'FEATURE_COPILOT'],
    ['collections', 'FEATURE_COLLECTIONS'],
  ])('AC-1.7.8 turns on only %s when %s=true', async (flag, variable) => {
    vi.stubEnv(variable, 'true');
    expect(await loadFeatures()).toEqual({ ...ALL_OFF, [flag]: true });
  });

  it.each(['FEATURE_COPILOT', 'FEATURE_COLLECTIONS'])(
    'reads %s as true only for the literal string "true"',
    async (variable) => {
      for (const value of ['TRUE', '1', 'yes', 'false', '']) {
        vi.stubEnv(variable, value);
        expect(await loadFeatures()).toEqual(ALL_OFF);
      }
    },
  );

  it('AC-1.7.8 ignores a leftover twin variable', async () => {
    vi.stubEnv(`${TWIN_PREFIX}COPILOT`, 'true');
    expect(await loadFeatures()).toEqual(ALL_OFF);
  });
});

const REPO_ROOT = path.resolve(__dirname, '../../../..');
// Built from parts, so this file doesn't contain the name it forbids elsewhere.
const TWIN_PREFIX = ['NEXT_PUBLIC', 'FEATURE_'].join('_');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ['node_modules', '.next', 'dist', 'coverage'].includes(entry.name)
        ? []
        : sourceFiles(full);
    }
    return /\.(ts|tsx|js|mjs|cjs|ya?ml)$|^Dockerfile/.test(entry.name) ? [full] : [];
  });
}

describe('feature flag variables', () => {
  it('AC-1.7.8 .env.example sets FEATURE_COLLECTIONS=true, the AI flags to false and no twin', () => {
    const lines = readFileSync(path.join(REPO_ROOT, '.env.example'), 'utf8').split('\n');
    expect(lines).toContain('FEATURE_COLLECTIONS=true');
    for (const flag of ['SUMMARIES', 'CLUSTERS', 'COPILOT']) {
      expect(lines).toContain(`FEATURE_${flag}=false`);
    }
    expect(lines.filter((line) => line.includes(TWIN_PREFIX))).toEqual([]);
    expect(lines.filter((line) => /FEATURE_(RADAR|PREFERENCES)/.test(line))).toEqual([]);
  });

  it('AC-1.7.8 no source, Dockerfile or workflow file in the repo mentions a twin variable', () => {
    const files = ['.github', 'apps', 'e2e', 'packages'].flatMap((directory) =>
      sourceFiles(path.join(REPO_ROOT, directory)),
    );
    const readers = files.filter(
      (file) => file !== __filename && readFileSync(file, 'utf8').includes(TWIN_PREFIX),
    );
    expect(readers.map((file) => path.relative(REPO_ROOT, file))).toEqual([]);
  });
});
