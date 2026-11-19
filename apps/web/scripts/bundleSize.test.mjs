import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findOverBudget, measureRoute, scriptPathsInHtml } from './bundleSize.mjs';

describe('scriptPathsInHtml', () => {
  it('lists each script once and skips the noModule polyfills and inline scripts', () => {
    const html = `
      <script src="/_next/static/chunks/a.js" async=""></script>
      <script src="/_next/static/chunks/a.js" async=""></script>
      <script src="/_next/static/chunks/polyfill.js" noModule=""></script>
      <script>inline()</script>
      <script src="/_next/static/chunks/b.js?dpl=1" async=""></script>`;
    expect(scriptPathsInHtml(html)).toEqual(['static/chunks/a.js', 'static/chunks/b.js']);
  });
});

describe('findOverBudget', () => {
  it('reports only the routes above their budget', () => {
    const sizes = { '/': 150, '/feed': 190.5, '/saved': 190 };
    const budgets = { '/': 160, '/feed': 190, '/saved': 190 };
    expect(findOverBudget(sizes, budgets)).toEqual([{ route: '/feed', kb: 190.5, budget: 190 }]);
  });

  it('fails a gated route that was not measured', () => {
    expect(findOverBudget({}, { '/feed': 190 })).toHaveLength(1);
  });
});

describe('measureRoute', () => {
  it('an over-budget build output fails the gate end to end', () => {
    const nextDir = mkdtempSync(join(tmpdir(), 'next-'));
    mkdirSync(join(nextDir, 'static/chunks'), { recursive: true });
    mkdirSync(join(nextDir, 'server/app'), { recursive: true });
    // Random bytes do not compress: 200 KB on disk is about 200 KB gzip.
    writeFileSync(join(nextDir, 'static/chunks/big.js'), randomBytes(200 * 1024));
    writeFileSync(
      join(nextDir, 'server/app/saved.html'),
      '<script src="/_next/static/chunks/big.js" async=""></script>',
    );

    const sizes = { '/saved': measureRoute(nextDir, '/saved') };

    expect(findOverBudget(sizes, { '/saved': 190 })).toHaveLength(1);
    expect(findOverBudget(sizes, { '/saved': 250 })).toHaveLength(0);
  });
});
