import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  '.next',
  'dist',
  'out',
  '.turbo',
  'coverage',
  'test-results',
  'playwright-report',
  '.lighthouseci',
  'generated',
]);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|json)$/;
// Built from parts so this file doesn't contain the names it forbids.
const V08_MESSAGE_NAMES = [
  ['surface', 'Update'],
  ['dataModel', 'Update'],
  ['begin', 'Rendering'],
].map((parts) => parts.join(''));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(path);
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });
}

describe('A2UI spec version', () => {
  it('no source file in apps/, packages/ or e2e/ uses a v0.8 message name', () => {
    const offenders = ['apps', 'packages', 'e2e']
      .flatMap((folder) => sourceFiles(join(repoRoot, folder)))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return V08_MESSAGE_NAMES.some((name) => source.includes(name));
      });
    expect(offenders).toEqual([]);
  });
});
