import { existsSync, readFileSync } from 'node:fs';

const fixturesDir = new URL('./fixtures/', import.meta.url);

type FixtureFolder = 'hn-algolia' | 'devto-comments' | 'devto-articles';

function fixtureUrl(folder: FixtureFolder, id: string) {
  return new URL(`${folder}/${id}.json`, fixturesDir);
}

/** A recorded HN Algolia or Dev.to payload, parsed. */
export function readSummaryFixture(folder: FixtureFolder, id: string): unknown {
  return JSON.parse(readFileSync(fixtureUrl(folder, id), 'utf8'));
}

// Maps an upstream URL a summary reads to its fixture folder and id.
function fixtureFor(url: URL): { folder: FixtureFolder; id: string } | undefined {
  const algoliaId = /^\/api\/v1\/items\/(\d+)$/.exec(url.pathname)?.[1];
  if (url.host === 'hn.algolia.com' && algoliaId) return { folder: 'hn-algolia', id: algoliaId };
  if (url.host !== 'dev.to') return undefined;
  const articleId = /^\/api\/articles\/(\d+)$/.exec(url.pathname)?.[1];
  if (articleId) return { folder: 'devto-articles', id: articleId };
  const commentsFor = url.pathname === '/api/comments' ? url.searchParams.get('a_id') : null;
  return commentsFor ? { folder: 'devto-comments', id: commentsFor } : undefined;
}

interface SummaryFixtureOptions {
  /** HN ids without a recording are served this recorded thread, so tests can create many HN stories. */
  hnFallbackId?: string;
  /** Requests whose URL contains one of these strings answer HTTP 500. */
  failing?: string[];
  /** Requests whose URL contains one of these strings answer HTTP 404, even with a fallback. */
  missing?: string[];
}

/** A `fetch` stand-in that serves the recorded comment and article payloads and lists every URL requested. */
export function summaryFixtureFetch({
  hnFallbackId,
  failing = [],
  missing = [],
}: SummaryFixtureOptions = {}) {
  const requests: string[] = [];
  const fetchStub: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url.href);
    if (failing.some((part) => url.href.includes(part))) return new Response('', { status: 500 });
    const path = missing.some((part) => url.href.includes(part))
      ? undefined
      : fixturePath(url, hnFallbackId);
    if (!path) return Response.json({ error: 'not found' }, { status: 404 });
    return new Response(readFileSync(path), { headers: { 'content-type': 'application/json' } });
  };
  return { fetch: fetchStub, requests };
}

function fixturePath(url: URL, hnFallbackId: string | undefined) {
  const fixture = fixtureFor(url);
  if (!fixture) return undefined;
  const recorded = fixtureUrl(fixture.folder, fixture.id);
  if (existsSync(recorded)) return recorded;
  return fixture.folder === 'hn-algolia' && hnFallbackId
    ? fixtureUrl('hn-algolia', hnFallbackId)
    : undefined;
}
