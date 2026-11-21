// Fails when a gated route's first-load JS exceeds its budget in bundle-budgets.json, contains a forbidden module (Recharts, the A2UI renderer, lit), or a first-load chunk lacks the compile hint.
// Run after `next build`: pnpm --filter web size
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  findForbiddenModules,
  findOverBudget,
  MANIFEST_CHECK,
  manifestMatchesHtml,
  measureRoute,
} from './bundleSize.mjs';
import { scriptsWithoutCompileHint } from './compileHints.mjs';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const budgets = JSON.parse(readFileSync(`${webDir}bundle-budgets.json`, 'utf8'));

const nextDir = `${webDir}.next`;
// /feed and /story/[id] are measured from the build manifests, /saved from its HTML: the two methods must agree on /saved.
if (!manifestMatchesHtml(nextDir, MANIFEST_CHECK.routeDir, MANIFEST_CHECK.htmlFile)) {
  console.error('The manifest rule no longer matches the HTML; update dynamicRouteScripts.');
  process.exit(1);
}

const unhinted = scriptsWithoutCompileHint(nextDir);
if (unhinted.length > 0) {
  console.error(
    `First-load chunks without the compile hint; did the build skip addCompileHints.mjs?\n${unhinted.join('\n')}`,
  );
  process.exit(1);
}

const sizes = {};
for (const route of Object.keys(budgets)) {
  sizes[route] = measureRoute(nextDir, route);
  console.log(
    `${route.padEnd(14)} ${sizes[route].toFixed(1).padStart(6)} KB / ${budgets[route]} KB`,
  );
}

const failures = findOverBudget(sizes, budgets);
for (const { route, kb, budget } of failures) {
  console.error(`OVER BUDGET ${route}: ${kb.toFixed(1)} KB > ${budget} KB`);
}

const forbidden = findForbiddenModules(nextDir);
for (const { route, module, script } of forbidden) {
  console.error(`FORBIDDEN MODULE ${module} in the first load of ${route}: ${script}`);
}
process.exit(failures.length > 0 || forbidden.length > 0 ? 1 : 0);
