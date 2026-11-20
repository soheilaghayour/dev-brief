import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { firstLoadScripts } from './bundleSize.mjs';

const COMPILE_HINT = '//# allFunctionsCalledOnLoad';

/** Puts V8's compile hint on line 1 of every script some route loads on its first page load; returns how many. */
export function addCompileHints(nextDir) {
  const scripts = firstLoadScripts(nextDir);
  for (const script of scripts) {
    const path = join(nextDir, script);
    writeFileSync(path, withCompileHint(script, readFileSync(path, 'utf8')));
  }
  return scripts.length;
}

/** The first-load scripts whose line 1 is not the compile hint. */
export function scriptsWithoutCompileHint(nextDir) {
  return firstLoadScripts(nextDir).filter(
    (script) => !readFileSync(join(nextDir, script), 'utf8').startsWith(`${COMPILE_HINT}\n`),
  );
}

// V8 reads the hint only on line 1, so Sentry's debug-ID snippet moves below the code; that is safe only because Sentry starts after load (DECISIONS.md).
function withCompileHint(script, source) {
  const [firstLine, ...rest] = source.split('\n');
  if (!firstLine.includes('_debugIds')) {
    throw new Error(
      `${script}: expected Sentry's debug-ID snippet on line 1, found: ${firstLine.slice(0, 80)}. ` +
        'The hint must replace that line, or every code line shifts and the uploaded source maps stop matching. ' +
        "The snippet comes from Sentry's native Turbopack debug IDs, so `sourcemaps.disable: true` or a webpack build removes or moves it.",
    );
  }
  const codeEnd = rest.findLastIndex((line) => line !== '' && !line.startsWith('//#')) + 1;
  return [COMPILE_HINT, ...rest.slice(0, codeEnd), firstLine, ...rest.slice(codeEnd)].join('\n');
}
