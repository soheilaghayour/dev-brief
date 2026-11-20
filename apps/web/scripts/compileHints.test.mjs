import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCompileHint, addCompileHints, COMPILE_HINT } from './compileHints.mjs';

const SNIPPET =
  ';!function(){try{var e=globalThis;(e._debugIds||(e._debugIds={}))[1]="id"}catch(e){}}();';
const CHUNK = [SNIPPET, 'code();', 'more();', '', '//# debugId=id'].join('\n');

describe('addCompileHint', () => {
  it('puts the hint on line 1, where V8 reads it', () => {
    expect(addCompileHint(CHUNK).split('\n')[0]).toBe(COMPILE_HINT);
  });

  it('keeps every code line at its line number, so uploaded source maps still match', () => {
    const lines = addCompileHint(CHUNK).split('\n');
    expect(lines[1]).toBe('code();');
    expect(lines[2]).toBe('more();');
  });

  it('moves the debug-ID snippet below the code, before the trailing comments', () => {
    expect(addCompileHint(CHUNK).split('\n').slice(3)).toEqual([SNIPPET, '', '//# debugId=id']);
  });

  it('leaves a hinted chunk unchanged', () => {
    const hinted = addCompileHint(CHUNK);
    expect(addCompileHint(hinted)).toBe(hinted);
  });

  it('throws when line 1 is code, since a new line would shift the source maps', () => {
    expect(() => addCompileHint('code();\n')).toThrow(/debug-ID snippet/);
  });
});

describe('addCompileHints', () => {
  it('hints every chunk of the build except the noModule polyfills', () => {
    const nextDir = mkdtempSync(join(tmpdir(), 'compile-hints-'));
    mkdirSync(join(nextDir, 'static', 'chunks', 'nested'), { recursive: true });
    const polyfills = 'static/chunks/polyfill.js';
    writeFileSync(
      join(nextDir, 'build-manifest.json'),
      JSON.stringify({ polyfillFiles: [polyfills] }),
    );
    writeFileSync(join(nextDir, polyfills), '!function(){}();\n');
    for (const file of ['static/chunks/a.js', 'static/chunks/nested/b.js']) {
      writeFileSync(join(nextDir, file), CHUNK);
    }
    writeFileSync(join(nextDir, 'static', 'chunks', 'styles.css'), 'a{}');

    expect(addCompileHints(nextDir)).toBe(2);
    expect(readFileSync(join(nextDir, 'static/chunks/nested/b.js'), 'utf8')).toBe(
      addCompileHint(CHUNK),
    );
    expect(readFileSync(join(nextDir, polyfills), 'utf8')).toBe('!function(){}();\n');
  });
});
