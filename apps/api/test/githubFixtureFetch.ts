import { readFileSync } from 'node:fs';

const fixtureDir = new URL('./fixtures/github/', import.meta.url);

export type GithubFixtureName = 'search-page-1' | 'search-page-2' | 'search-short';

export function readGithubFixture(name: GithubFixtureName) {
  return readFileSync(new URL(`${name}.json`, fixtureDir), 'utf8');
}

export function githubFixtureRepos(name: GithubFixtureName) {
  return (
    JSON.parse(readGithubFixture(name)) as {
      items: { id: number; full_name: string; stargazers_count: number }[];
    }
  ).items;
}

/** The moment the search pages were recorded; `created:>` in their query is 7 days before it. */
export const GITHUB_FIXTURE_NOW = new Date('2026-11-20T08:12:12Z');

interface FixtureOptions {
  /** The fixture each page number serves, page 1 first; a page past the list answers no items. */
  pages?: GithubFixtureName[];
  /** The `x-ratelimit-remaining` header per page, page 1 first; a missing entry sends no header. */
  rateLimitRemaining?: string[];
  /** Pages, page 1 first, whose `incomplete_results` is set to true. */
  incompletePages?: number[];
}

/** A `fetch` stand-in that serves the recorded GitHub search pages, so no test reaches the network. */
export function githubFixtureFetch({
  pages = ['search-page-1', 'search-page-2'],
  rateLimitRemaining = ['29', '28'],
  incompletePages = [],
}: FixtureOptions = {}): typeof fetch {
  return async (input) => {
    const page = Number(new URL(String(input)).searchParams.get('page'));
    const name = pages[page - 1];
    const remaining = rateLimitRemaining[page - 1];
    const body = name
      ? readGithubFixture(name)
      : '{"total_count":0,"incomplete_results":false,"items":[]}';
    return new Response(
      incompletePages.includes(page)
        ? JSON.stringify({ ...JSON.parse(body), incomplete_results: true })
        : body,
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...(remaining !== undefined && { 'X-RateLimit-Remaining': remaining }),
        },
      },
    );
  };
}
