// First-load JS as docs/prd.md section 8.5 defines it: the gzip (level 6) size of every script in
// the route's HTML except the noModule polyfills, summed, KB = 1024 bytes.
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);

/** The script paths (relative to `.next`) a page's HTML loads or preloads, without the noModule polyfills. */
export function scriptPathsInHtml(html) {
  const paths = [];
  for (const [, attributes] of html.matchAll(/<script\b([^>]*)>/g)) {
    if (/\bnomodule\b/i.test(attributes)) continue;
    const src = attributes.match(/\bsrc="[^"]*?\/_next\/([^"?]+)/);
    if (src) paths.push(src[1]);
  }
  // A dynamic import rendered on the server is preloaded and hydration waits for it, so it is first-load JS.
  for (const [, attributes] of html.matchAll(/<link\b([^>]*)>/g)) {
    const isScriptPreload =
      /\bas="script"/i.test(attributes) || /\brel="modulepreload"/i.test(attributes);
    const href = attributes.match(/\bhref="[^"]*?\/_next\/([^"?]+)/);
    if (isScriptPreload && href) paths.push(href[1]);
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
export function dynamicRouteScripts(nextDir, routeDir) {
  const buildManifest = JSON.parse(readFileSync(join(nextDir, 'build-manifest.json'), 'utf8'));
  require(join(nextDir, 'server/app', routeDir, 'page_client-reference-manifest.js'));
  // require runs a manifest only once per process, so its entry is looked up by key, never by resetting the global.
  const { entryJSFiles } = globalThis.__RSC_MANIFEST[`/${routeDir}/page`];
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

/** Whether the manifest rule lists the same scripts as the prerendered HTML of a route in the same route group. */
export function manifestMatchesHtml(nextDir, routeDir, htmlFile) {
  const fromManifest = new Set(dynamicRouteScripts(nextDir, routeDir));
  const fromHtml = new Set(
    scriptPathsInHtml(readFileSync(join(nextDir, 'server/app', htmlFile), 'utf8')),
  );
  return fromManifest.size === fromHtml.size && [...fromHtml].every((p) => fromManifest.has(p));
}

/** Where each gated route lives in `.next/server/app`: a prerendered HTML file or a route directory. */
const ROUTE_SOURCES = {
  '/': { html: 'index.html' },
  '/feed': { dir: '(app)/feed' },
  '/saved': { html: 'saved.html' },
  '/story/[id]': { dir: '(app)/story/[id]' },
  '/radar': { dir: '(app)/radar' },
  '/collections/[slug]': { dir: '(app)/collections/[slug]' },
};

/** Modules that must stay out of the listed routes' first load, each recognised by a string its minified code keeps. */
export const FORBIDDEN_MODULES = [
  { name: 'Recharts', marker: /recharts-[a-z]/ },
  { name: '@a2ui/react', marker: /a2ui-react-/ },
  { name: '@a2ui/web_core', marker: /ValidationConfig\.allowedMessages/ },
  { name: 'lit', marker: /litHtmlVersions/ },
  // The protocol allowlist of react-markdown's default URL transform.
  { name: 'react-markdown', marker: /https\?\|ircs\?\|mailto\|xmpp/ },
];

/** Routes the forbidden modules are checked on: every gated route, the lazy ones included. */
export const FORBIDDEN_MODULE_ROUTES = [
  '/',
  '/feed',
  '/saved',
  '/story/[id]',
  '/radar',
  '/collections/[slug]',
];

/** `/saved` is prerendered in the (app) group, so its HTML shows what the manifest rule must reproduce for `/feed` and `/story/[id]`. */
export const MANIFEST_CHECK = { routeDir: '(app)/saved', htmlFile: 'saved.html' };

function scriptsOf(nextDir, route) {
  const source = ROUTE_SOURCES[route];
  if (!source) throw new Error(`No build output known for route ${route}`);
  if (!source.html) return dynamicRouteScripts(nextDir, source.dir);
  const file = join(nextDir, 'server/app', source.html);
  if (!existsSync(file)) throw new Error(`${route} is no longer prerendered; update ROUTE_SOURCES`);
  return scriptPathsInHtml(readFileSync(file, 'utf8'));
}

export function measureRoute(nextDir, route) {
  const scripts = scriptsOf(nextDir, route);
  // A pattern that matches nothing would otherwise measure 0 KB and pass forever.
  if (scripts.length === 0)
    throw new Error(`${route}: no scripts found; the measurement is broken`);
  return gzipKb(nextDir, scripts);
}

/** `{ route, module, script }` for each first-load script of the routes that contains a forbidden module. */
export function findForbiddenModules(nextDir, routes = FORBIDDEN_MODULE_ROUTES) {
  return routes.flatMap((route) =>
    scriptsOf(nextDir, route).flatMap((script) => {
      const code = readFileSync(join(nextDir, script), 'utf8');
      return FORBIDDEN_MODULES.filter(({ marker }) => marker.test(code)).map(({ name }) => ({
        route,
        module: name,
        script,
      }));
    }),
  );
}

/** Every script some route loads on its first page load: from each prerendered HTML and each page's build manifests. */
export function firstLoadScripts(nextDir) {
  const appDir = join(nextDir, 'server/app');
  const scripts = readdirSync(appDir, { recursive: true }).flatMap((file) => {
    if (file.endsWith('.html')) return scriptPathsInHtml(readFileSync(join(appDir, file), 'utf8'));
    if (file.endsWith('page_client-reference-manifest.js'))
      return dynamicRouteScripts(nextDir, dirname(file));
    return [];
  });
  return [...new Set(scripts)];
}
