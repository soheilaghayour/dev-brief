import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addCompileHints, scriptsWithoutCompileHint } from './compileHints.mjs';

const SNIPPET =
  ';!function(){try{var e=globalThis;(e._debugIds||(e._debugIds={}))[1]="id"}catch(e){}}();';
const CHUNK = [SNIPPET, 'code();', 'more();', '', '//# debugId=id'].join('\n');
const POLYFILLS = '!function(){}();\n';

// A build whose landing HTML loads first.js and the noModule polyfills; lazy.js loads only after the page.
function writeBuild(firstChunk = CHUNK) {
  const nextDir = mkdtempSync(join(tmpdir(), 'compile-hints-'));
  mkdirSync(join(nextDir, 'static/chunks'), { recursive: true });
  mkdirSync(join(nextDir, 'server/app'), { recursive: true });
  writeFileSync(
    join(nextDir, 'server/app/index.html'),
    '<script src="/_next/static/chunks/first.js" async=""></script>' +
      '<script src="/_next/static/chunks/polyfills.js" noModule=""></script>',
  );
  writeFileSync(join(nextDir, 'static/chunks/first.js'), firstChunk);
  writeFileSync(join(nextDir, 'static/chunks/lazy.js'), CHUNK);
  writeFileSync(join(nextDir, 'static/chunks/polyfills.js'), POLYFILLS);
  return nextDir;
}

const chunk = (nextDir, name) => readFileSync(join(nextDir, 'static/chunks', name), 'utf8');

describe('addCompileHints', () => {
  it('puts the hint on line 1 and the debug-ID snippet below the code, so every code line keeps its number', () => {
    const nextDir = writeBuild();

    expect(addCompileHints(nextDir)).toBe(1);
    expect(chunk(nextDir, 'first.js').split('\n')).toEqual([
      '//# allFunctionsCalledOnLoad',
      'code();',
      'more();',
      SNIPPET,
      '',
      '//# debugId=id',
    ]);
  });

  it('leaves chunks outside every first page load unhinted: lazy chunks and the noModule polyfills', () => {
    const nextDir = writeBuild();

    addCompileHints(nextDir);

    expect(chunk(nextDir, 'lazy.js')).toBe(CHUNK);
    expect(chunk(nextDir, 'polyfills.js')).toBe(POLYFILLS);
  });

  it('throws naming the chunk when line 1 is code, since a new line would shift the source maps', () => {
    expect(() => addCompileHints(writeBuild('code();\n'))).toThrow(
      /static\/chunks\/first\.js: expected Sentry's debug-ID snippet/,
    );
  });
});

describe('scriptsWithoutCompileHint', () => {
  it('lists the first-load chunks until the hints are added', () => {
    const nextDir = writeBuild();

    expect(scriptsWithoutCompileHint(nextDir)).toEqual(['static/chunks/first.js']);
    addCompileHints(nextDir);
    expect(scriptsWithoutCompileHint(nextDir)).toEqual([]);
  });
});
