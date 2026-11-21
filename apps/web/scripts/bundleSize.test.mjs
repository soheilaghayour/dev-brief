import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  dynamicRouteScripts,
  findForbiddenModules,
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

  it('counts scripts the HTML preloads, once, and not other preloads', () => {
    const html = `
      <link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/lazy.js"/>
      <link rel="modulepreload" href="/_next/static/chunks/mod.js?dpl=1"/>
      <link rel="preload" href="/_next/static/media/f.woff2" as="font" crossorigin=""/>
      <link rel="stylesheet" href="/_next/static/chunks/s.css"/>
      <script src="/_next/static/chunks/lazy.js" async=""></script>`;
    expect(scriptPathsInHtml(html)).toEqual(['static/chunks/lazy.js', 'static/chunks/mod.js']);
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

describe('findForbiddenModules', () => {
  function writeSavedBuild(code) {
    const nextDir = mkdtempSync(join(tmpdir(), 'next-'));
    mkdirSync(join(nextDir, 'static/chunks'), { recursive: true });
    mkdirSync(join(nextDir, 'server/app'), { recursive: true });
    writeFileSync(join(nextDir, 'static/chunks/a.js'), code);
    writeFileSync(
      join(nextDir, 'server/app/saved.html'),
      '<script src="/_next/static/chunks/a.js" async=""></script>',
    );
    return nextDir;
  }

  it('AC-3.3.3 reports Recharts found in a first-load script', () => {
    const nextDir = writeSavedBuild('x="recharts-wrapper";');
    expect(findForbiddenModules(nextDir, ['/saved'])).toEqual([
      { route: '/saved', module: 'Recharts', script: 'static/chunks/a.js' },
    ]);
  });

  it('reports the A2UI renderer and lit found in a first-load script', () => {
    const nextDir = writeSavedBuild(
      'x="a2ui-react-markdown";y="updateDataModel";z=litHtmlVersions;',
    );
    expect(findForbiddenModules(nextDir, ['/saved']).map(({ module }) => module)).toEqual([
      '@a2ui/react',
      '@a2ui/web_core',
      'lit',
    ]);
  });

  it('AC-3.3.3 passes first-load scripts without Recharts', () => {
    expect(findForbiddenModules(writeSavedBuild('x=1;'), ['/saved'])).toEqual([]);
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

  it('lists the same scripts on a second call, although require runs the manifest only once', () => {
    const nextDir = writeBuild({ entryJSFiles: ENTRY_JS_FILES });

    expect(dynamicRouteScripts(nextDir, '(app)/x')).toEqual(
      dynamicRouteScripts(nextDir, '(app)/x'),
    );
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

// The gate measures /feed and /story/[id] from build manifests, which cannot show the preload link of a server-rendered dynamic import.
describe('next/dynamic', () => {
  it('is used only where its chunk is not server-rendered into the first load', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));
    const users = readdirSync(srcDir, { recursive: true })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => readFileSync(join(srcDir, file), 'utf8').includes("from 'next/dynamic'"))
      .map((file) => file.replaceAll('\\', '/'))
      .sort();

    // Each renders its dynamic part with `ssr: false` or only after an interaction; a new user needs the same, and a place here.
    expect(users).toEqual([
      'components/account/LazyAccountSlot.tsx',
      'components/layout/LazyToaster.tsx',
      'components/layout/SheetLauncher.tsx',
      'lib/hotkeys/HotkeysProvider.tsx',
    ]);
  });
});
