import { readFileSync } from 'node:fs';

const fixtureDir = new URL('./fixtures/devto/', import.meta.url);

function readFixture(name: string): unknown[] {
  return JSON.parse(readFileSync(new URL(name, fixtureDir), 'utf8')) as unknown[];
}

export const fixtureTopArticles = readFixture('top.json');
export const fixtureLatestArticles = readFixture('latest.json');
export const fixtureOverlappingArticles = readFixture('latest-overlapping.json');

/** A `fetch` stand-in that serves the recorded Dev.to lists, so no test reaches the network. */
export function devtoFixtureFetch({
  latest = fixtureLatestArticles,
}: { latest?: unknown[] } = {}): typeof fetch {
  return async (input) => {
    const { pathname } = new URL(String(input));
    return Response.json(pathname === '/api/articles/latest' ? latest : fixtureTopArticles);
  };
}
