import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const COMPILE_HINT = '//# allFunctionsCalledOnLoad';

/** Returns the chunk with V8's compile hint as its first line and every code line at its old line number. */
export function addCompileHint(source) {
  const [firstLine, ...rest] = source.split('\n');
  if (firstLine === COMPILE_HINT) return source;
  // V8 reads the hint only on line 1; Sentry's debug-ID snippet there works anywhere, so it moves below the code and uploaded source maps still match.
  if (!firstLine.includes('_debugIds')) {
    throw new Error(
      `Expected Sentry's debug-ID snippet on line 1, found: ${firstLine.slice(0, 80)}`,
    );
  }
  let codeEnd = rest.length;
  while (codeEnd > 0 && (rest[codeEnd - 1] === '' || rest[codeEnd - 1].startsWith('//#'))) {
    codeEnd -= 1;
  }
  return [COMPILE_HINT, ...rest.slice(0, codeEnd), firstLine, ...rest.slice(codeEnd)].join('\n');
}

/** Adds the compile hint to every client chunk of a build except the noModule polyfills; returns how many. */
export function addCompileHints(nextDir) {
  const { polyfillFiles } = JSON.parse(readFileSync(join(nextDir, 'build-manifest.json'), 'utf8'));
  const chunks = readdirSync(join(nextDir, 'static', 'chunks'), { recursive: true })
    .map((name) => `static/chunks/${name}`)
    .filter((file) => file.endsWith('.js') && !polyfillFiles.includes(file));
  for (const file of chunks) {
    const path = join(nextDir, file);
    writeFileSync(path, addCompileHint(readFileSync(path, 'utf8')));
  }
  return chunks.length;
}
