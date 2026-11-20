import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const LIB_FOLDER = join(SRC, 'lib') + sep;

describe('browser storage access', () => {
  it('AC-1.4.5 components never touch localStorage or sessionStorage', () => {
    const offenders = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\./.test(path))
      .map((path) => join(SRC, path))
      .filter((path) => !path.startsWith(LIB_FOLDER))
      .filter((path) => /\b(localStorage|sessionStorage)\b/.test(readFileSync(path, 'utf8')));

    expect(offenders).toEqual([]);
  });
});
