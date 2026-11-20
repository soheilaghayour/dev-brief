import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dynamicRouteScripts,
  findOverBudget,
  manifestMatchesHtml,
  measureRoute,
  scriptPathsInHtml,
} from './bundleSize.mjs';

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

  it('finds scripts behind an asset prefix', () => {
    const html = '<script src="https://cdn.example.com/_next/static/chunks/a.js"></script>';
    expect(scriptPathsInHtml(html)).toEqual(['static/chunks/a.js']);
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

  it('refuses to measure a route whose HTML has no scripts', () => {
    const nextDir = mkdtempSync(join(tmpdir(), 'next-'));
    mkdirSync(join(nextDir, 'server/app'), { recursive: true });
    writeFileSync(join(nextDir, 'server/app/saved.html'), '<html></html>');

    expect(() => measureRoute(nextDir, '/saved')).toThrow(/no scripts found/);
  });
});

// A build output with the shapes Next writes: the root main files and, per route, the entry chunks keyed by module.
function writeBuild({ entryJSFiles }) {
  const nextDir = mkdtempSync(join(tmpdir(), 'next-'));
  mkdirSync(join(nextDir, 'server/app/(app)/x'), { recursive: true });
  writeFileSync(
    join(nextDir, 'build-manifest.json'),
    JSON.stringify({ rootMainFiles: ['static/chunks/main.js'] }),
  );
  writeFileSync(
    join(nextDir, 'server/app/(app)/x/page_client-reference-manifest.js'),
    `globalThis.__RSC_MANIFEST = ${JSON.stringify({ '/(app)/x/page': { entryJSFiles } })};`,
  );
  return nextDir;
}

const ENTRY_JS_FILES = {
  '[project]/src/app/(app)/x/page': ['static/chunks/page.js'],
  '[project]/src/app/(app)/layout': ['static/chunks/layout.js'],
  '[project]/src/app/error': ['static/chunks/error.js'],
  '[project]/src/app/global-error': ['static/chunks/global-error.js'],
  '[project]/src/app/not-found': ['static/chunks/not-found.js'],
};

describe('dynamicRouteScripts', () => {
  it('lists the root files, the page and the error boundaries, and leaves out not-found', () => {
    const scripts = dynamicRouteScripts(writeBuild({ entryJSFiles: ENTRY_JS_FILES }), '(app)/x');

    expect(scripts.sort()).toEqual([
      'static/chunks/error.js',
      'static/chunks/global-error.js',
      'static/chunks/main.js',
      'static/chunks/page.js',
    ]);
  });
});

describe('manifestMatchesHtml', () => {
  const html = (files) => files.map((f) => `<script src="/_next/${f}"></script>`).join('');
  const sameFiles = [
    'static/chunks/main.js',
    'static/chunks/page.js',
    'static/chunks/error.js',
    'static/chunks/global-error.js',
  ];

  it('agrees when the HTML loads the files the manifest rule lists', () => {
    const nextDir = writeBuild({ entryJSFiles: ENTRY_JS_FILES });
    writeFileSync(join(nextDir, 'server/app/saved.html'), html(sameFiles));

    expect(manifestMatchesHtml(nextDir, '(app)/x', 'saved.html')).toBe(true);
  });

  it('disagrees when the HTML loads a file the rule misses', () => {
    const nextDir = writeBuild({ entryJSFiles: ENTRY_JS_FILES });
    writeFileSync(
      join(nextDir, 'server/app/saved.html'),
      html([...sameFiles, 'static/chunks/not-found.js']),
    );

    expect(manifestMatchesHtml(nextDir, '(app)/x', 'saved.html')).toBe(false);
  });
});
