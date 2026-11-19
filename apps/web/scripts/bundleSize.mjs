// First-load JS as docs/prd.md section 8.5 defines it: the gzip (level 6) size of every script in
// the route's HTML except the noModule polyfills, summed, KB = 1024 bytes.
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);

/** The script paths (relative to `.next`) in a page's HTML, without the noModule polyfills. */
export function scriptPathsInHtml(html) {
  const paths = [];
  for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/g)) {
    if (/\bnomodule\b/i.test(attributes)) continue;
    const src = attributes.match(/\bsrc="\/_next\/([^"?]+)/);
    if (src) paths.push(src[1]);
  }
  return [...new Set(paths)];
}

/** Gzip size in KB of the given files, relative to `nextDir`. */
export function gzipKb(nextDir, paths) {
  let bytes = 0;
  for (const path of paths)
    bytes += gzipSync(readFileSync(join(nextDir, path)), { level: 6 }).length;
  return bytes / 1024;
}

/** Over-budget routes as `{ route, kb, budget }`; a route without a measurement counts as a failure. */
export function findOverBudget(sizes, budgets) {
  return Object.entries(budgets)
    .filter(([route, budget]) => !(sizes[route] <= budget))
    .map(([route, budget]) => ({ route, kb: sizes[route], budget }));
}

// Prerendered routes have their HTML on disk; server-rendered ones need the build manifests,
// which list what Next puts in the HTML: the root main files, the page entry, and the error
// boundaries every app HTML preloads.
function dynamicRouteScripts(nextDir, routeDir) {
  const buildManifest = JSON.parse(readFileSync(join(nextDir, 'build-manifest.json'), 'utf8'));
  globalThis.__RSC_MANIFEST = {};
  require(join(nextDir, 'server/app', routeDir, 'page_client-reference-manifest.js'));
  const { entryJSFiles } = Object.values(globalThis.__RSC_MANIFEST)[0];
  const isBoundaryOrPage = (key) => /\/(page|error|global-error)$/.test(key);
  return [
    ...new Set([
      ...buildManifest.rootMainFiles,
      ...Object.entries(entryJSFiles)
        .filter(([key]) => isBoundaryOrPage(key))
        .flatMap(([, files]) => files),
    ]),
  ];
}

/** Where each gated route lives in `.next/server/app`: a prerendered HTML file or a route directory. */
const ROUTE_SOURCES = {
  '/': { html: 'index.html' },
  '/feed': { dir: '(app)/feed' },
  '/saved': { html: 'saved.html' },
  '/story/[id]': { dir: '(app)/story/[id]' },
};

export function measureRoute(nextDir, route) {
  const source = ROUTE_SOURCES[route];
  if (!source) throw new Error(`No build output known for route ${route}`);
  if (source.html) {
    const file = join(nextDir, 'server/app', source.html);
    if (!existsSync(file))
      throw new Error(`${route} is no longer prerendered; update ROUTE_SOURCES`);
    return gzipKb(nextDir, scriptPathsInHtml(readFileSync(file, 'utf8')));
  }
  return gzipKb(nextDir, dynamicRouteScripts(nextDir, source.dir));
}
