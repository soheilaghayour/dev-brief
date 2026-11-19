// Fails when a gated route's first-load JS exceeds its budget in bundle-budgets.json.
// Run after `next build`: pnpm --filter web size
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findOverBudget, measureRoute } from './bundleSize.mjs';

const webDir = fileURLToPath(new URL('..', import.meta.url));
const budgets = JSON.parse(readFileSync(`${webDir}bundle-budgets.json`, 'utf8'));

const sizes = {};
for (const route of Object.keys(budgets)) {
  sizes[route] = measureRoute(`${webDir}.next`, route);
  console.log(
    `${route.padEnd(14)} ${sizes[route].toFixed(1).padStart(6)} KB / ${budgets[route]} KB`,
  );
}

const failures = findOverBudget(sizes, budgets);
for (const { route, kb, budget } of failures) {
  console.error(`OVER BUDGET ${route}: ${kb.toFixed(1)} KB > ${budget} KB`);
}
process.exit(failures.length > 0 ? 1 : 0);
