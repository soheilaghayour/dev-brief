import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../../common/http/httpClient.js';
import type { Source } from '../../../generated/prisma/client.js';
import {
  GITHUB_FIXTURE_NOW,
  githubFixtureFetch,
  githubFixtureRepos,
} from '../../../../test/githubFixtureFetch.js';
import { GITHUB_TOKEN_MISSING, GithubAdapter } from './github.adapter.js';

const source = { slug: 'github', kind: 'github' } as Source;
const signal = new AbortController().signal;

function adapterWith(fetchStub: typeof fetch) {
  // random = 0 makes retry backoff instant
  return new GithubAdapter(
    new HttpClient(fetchStub, () => 0),
    'test-token',
    () => GITHUB_FIXTURE_NOW,
  );
}

function spyFetch(base: typeof fetch = githubFixtureFetch()) {
  return vi.fn<typeof fetch>((input, init) => base(input, init));
}

afterEach(() => vi.restoreAllMocks());

describe('GithubAdapter', () => {
  it('reads both recorded pages: 60 repos, two serial requests with token, Accept and API version headers', async () => {
    const stub = spyFetch();
    const items = await adapterWith(stub).fetch(source, { signal });

    expect(items).toHaveLength(60);
    expect(stub.mock.calls.map(([input]) => String(input))).toEqual([
      'https://api.github.com/search/repositories?q=created%3A%3E2026-11-13+stars%3A%3E50&sort=stars&order=desc&per_page=30&page=1',
      'https://api.github.com/search/repositories?q=created%3A%3E2026-11-13+stars%3A%3E50&sort=stars&order=desc&per_page=30&page=2',
    ]);
    for (const [, init] of stub.mock.calls) {
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer test-token',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': expect.stringContaining('DevBriefBot'),
      });
    }
  });

  it('uses the UTC date 7 days before now in the created filter', async () => {
    const stub = spyFetch();
    const lateEvening = new Date('2026-11-20T23:30:00Z');
    const adapter = new GithubAdapter(
      new HttpClient(stub, () => 0),
      'test-token',
      () => lateEvening,
    );
    await adapter.fetch(source, { signal });
    const query = new URL(String(stub.mock.calls[0]?.[0])).searchParams.get('q');
    expect(query).toBe('created:>2026-11-13 stars:>50');
  });

  it('maps a recorded repo: id, html_url, owner, created_at, stars and lowercased language + topics', async () => {
    const items = await adapterWith(githubFixtureFetch()).fetch(source, { signal });
    const recorded = githubFixtureRepos('search-page-2').find(
      ({ full_name }) => full_name === 'replit/datacat',
    );
    expect(items.find((item) => item.externalId === String(recorded?.id))).toEqual({
      externalId: '1460835528',
      url: 'https://github.com/replit/datacat',
      discussionUrl: null,
      title:
        'replit/datacat: Self-hosted observability: metrics, logs, traces, dashboards and alerts. Stores data in PostgreSQL or ClickHouse. Accepts O…',
      author: 'replit',
      publishedAt: new Date('2026-11-17T02:51:06Z'),
      points: null,
      commentsCount: null,
      reactionsCount: null,
      stars: 425,
      sourceTags: [
        'typescript',
        'alerting',
        'apm',
        'clickhouse',
        'dashboards',
        'logging',
        'metrics',
        'monitoring',
        'observability',
        'opentelemetry',
        'postgresql',
        'self-hosted',
        'tracing',
      ],
      excerpt: null,
      readingTimeMinutes: null,
    });
  });

  it('truncates "{full_name}: {description}" to 140 characters', async () => {
    const items = await adapterWith(githubFixtureFetch()).fetch(source, { signal });
    const longest = items.find((item) => item.externalId === '1459971684');
    expect(longest?.title).toMatch(/^erkamyaman\/rust-anything: Rewrite your whole app in Rust/);
    expect([...(longest?.title ?? '')]).toHaveLength(140);
    expect(longest?.title.endsWith('…')).toBe(true);
    const short = items.find((item) => item.externalId === '1457270665');
    expect(short?.title).toMatch(/^duwqijlk\/muse-protocol: .+[^…]$/);
  });

  it('titles a repo without a description by its full name and drops a null language', async () => {
    const items = await adapterWith(githubFixtureFetch()).fetch(source, { signal });
    expect(items.find((item) => item.externalId === '1461244802')?.title).toBe(
      'gylive/google-ultra',
    );
    const noLanguage = items.find((item) => item.externalId === '1464271688');
    expect(noLanguage?.sourceTags[0]).toBe('ai-agents');
    expect(noLanguage?.sourceTags).not.toContain(null);
  });

  it('stops after a page with fewer than 30 items and drops and counts an invalid repo', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const stub = spyFetch(githubFixtureFetch({ pages: ['search-short', 'search-page-1'] }));
    const items = await adapterWith(stub).fetch(source, { signal });

    expect(stub).toHaveBeenCalledOnce();
    expect(items.map((item) => item.url)).toEqual([
      'https://github.com/replit/datacat',
      'https://github.com/gylive/google-ultra',
      'https://github.com/onlook-dev/onlook',
    ]);
    expect(warn).toHaveBeenCalledWith('Dropped 1 invalid GitHub repositories');
  });

  it('counts a repo once when it moved from page 1 to page 2 between the calls', async () => {
    const stub = githubFixtureFetch({ pages: ['search-page-1', 'search-page-1'] });
    expect(await adapterWith(stub).fetch(source, { signal })).toHaveLength(30);
  });

  it('AC-2.4.2 stops after a page whose x-ratelimit-remaining is below 5, keeps its items and reports partial', async () => {
    const stub = spyFetch(githubFixtureFetch({ rateLimitRemaining: ['3', '2'] }));
    const reportPartial = vi.fn();
    const items = await adapterWith(stub).fetch(source, { signal, reportPartial });

    expect(stub).toHaveBeenCalledOnce();
    expect(items).toHaveLength(30);
    expect(reportPartial).toHaveBeenCalledExactlyOnceWith(
      'GitHub rate limit low (3 requests left); stopped after page 1',
    );
  });

  it('AC-2.4.2 reports partial when the last planned page is below the rate-limit threshold', async () => {
    const reportPartial = vi.fn();
    const stub = githubFixtureFetch({ rateLimitRemaining: ['5', '4'] });
    const items = await adapterWith(stub).fetch(source, { signal, reportPartial });

    expect(items).toHaveLength(60);
    expect(reportPartial).toHaveBeenCalledExactlyOnceWith(
      'GitHub rate limit low (4 requests left); stopped after page 2',
    );
  });

  it('reads both pages and reports nothing when the rate-limit header is missing', async () => {
    const reportPartial = vi.fn();
    const stub = spyFetch(githubFixtureFetch({ rateLimitRemaining: [] }));
    await adapterWith(stub).fetch(source, { signal, reportPartial });
    expect(stub).toHaveBeenCalledTimes(2);
    expect(reportPartial).not.toHaveBeenCalled();
  });

  it('fails after the first request and its 2 retries answer HTTP 500', async () => {
    const stub = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    await expect(adapterWith(stub).fetch(source, { signal })).rejects.toThrow('HTTP 500');
    expect(stub).toHaveBeenCalledTimes(3);
  });

  it('fails when the response is not a search result', async () => {
    const stub: typeof fetch = async () => Response.json({ message: 'Validation Failed' });
    await expect(adapterWith(stub).fetch(source, { signal })).rejects.toThrow();
  });

  it('is unavailable without a token, so the engine skips it', () => {
    const http = new HttpClient(githubFixtureFetch());
    expect(new GithubAdapter(http, undefined).unavailableReason()).toBe(GITHUB_TOKEN_MISSING);
    expect(new GithubAdapter(http, '').unavailableReason()).toBe(GITHUB_TOKEN_MISSING);
    expect(new GithubAdapter(http, 'test-token').unavailableReason()).toBeNull();
  });
});
