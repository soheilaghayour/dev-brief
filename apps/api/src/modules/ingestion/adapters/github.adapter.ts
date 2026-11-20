import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { HttpClient } from '../../../common/http/httpClient.js';
import type { Source } from '../../../generated/prisma/client.js';
import type { FetchContext, RawItem, SourceAdapter } from '../sourceAdapter.js';

const SEARCH_URL = 'https://api.github.com/search/repositories';
const PER_PAGE = 30;
const MAX_PAGES = 2;
const CREATED_WITHIN_DAYS = 7;
const MIN_STARS = 50;
const TITLE_MAX_LENGTH = 140;
// PRD §8.3 sets the stop threshold.
export const MIN_RATE_LIMIT_REMAINING = 5;
export const GITHUB_TOKEN_MISSING = 'GITHUB_TOKEN not set';
const DAY_MS = 86_400_000;
const MAX_RETRY_AFTER_MS = 30_000;
const REQUEST_OPTIONS = {
  timeoutMs: 8000,
  retryBackoffMs: [1000, 3000],
  maxRetryAfterMs: MAX_RETRY_AFTER_MS,
};

const SearchPageSchema = z.object({
  incomplete_results: z.boolean().catch(false),
  items: z.array(z.unknown()),
});

const GithubRepoSchema = z.object({
  id: z.number().int(),
  full_name: z.string().min(1),
  description: z.string().nullish(),
  html_url: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//.test(value)),
  owner: z
    .object({ login: z.string().min(1) })
    .nullish()
    .catch(null),
  created_at: z.string().datetime({ offset: true }),
  stargazers_count: z.number().int().nonnegative(),
  language: z.string().min(1).nullish().catch(null),
  topics: z.array(z.string()).catch([]),
});
type GithubRepo = z.infer<typeof GithubRepoSchema>;

/** The search URL for one page: repos created after the UTC date 7 days before `now`, most stars first. */
export function searchUrl(now: Date, page: number) {
  const since = new Date(now.getTime() - CREATED_WITHIN_DAYS * DAY_MS).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    q: `created:>${since} stars:>${MIN_STARS}`,
    sort: 'stars',
    order: 'desc',
    per_page: String(PER_PAGE),
    page: String(page),
  });
  return `${SEARCH_URL}?${query}`;
}

/** `{full_name}: {description}` on one line, at most 140 characters; the name alone without a description. */
function toTitle(repo: GithubRepo) {
  const description = repo.description?.replace(/\s+/g, ' ').trim();
  if (!description) return repo.full_name;
  const characters = [...`${repo.full_name}: ${description}`];
  return characters.length > TITLE_MAX_LENGTH
    ? `${characters.slice(0, TITLE_MAX_LENGTH - 1).join('')}…`
    : characters.join('');
}

function toRawItem(repo: GithubRepo): RawItem {
  return {
    externalId: String(repo.id),
    url: repo.html_url,
    discussionUrl: null,
    title: toTitle(repo),
    author: repo.owner?.login ?? null,
    publishedAt: new Date(repo.created_at),
    points: null,
    commentsCount: null,
    reactionsCount: null,
    stars: repo.stargazers_count,
    sourceTags: [repo.language, ...repo.topics].flatMap((tag) => (tag ? [tag.toLowerCase()] : [])),
    excerpt: null,
    readingTimeMinutes: null,
  };
}

/** True when the response reports fewer than 5 search requests left; a missing header is not low. */
function isRateLimitLow(remainingHeader: string | null) {
  return remainingHeader !== null && Number(remainingHeader) < MIN_RATE_LIMIT_REMAINING;
}

/** Reads new repositories gaining stars from the GitHub Search API: at most two serial pages. */
@Injectable()
export class GithubAdapter implements SourceAdapter {
  readonly kind = 'github';
  private readonly logger = new Logger(GithubAdapter.name);

  constructor(
    private readonly http: HttpClient,
    private readonly token: string | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  unavailableReason() {
    return this.token ? null : GITHUB_TOKEN_MISSING;
  }

  async fetch(_source: Source, { signal, reportPartial }: FetchContext): Promise<RawItem[]> {
    const now = this.now();
    const reposById = new Map<number, GithubRepo>();
    const partialReasons: string[] = [];
    let invalid = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await this.http.get(searchUrl(now, page), {
        ...REQUEST_OPTIONS,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal,
      });
      const { incomplete_results, items } = SearchPageSchema.parse(JSON.parse(response.text));
      // GitHub ends a slow search early and says so; the items it did return are still valid.
      if (incomplete_results) partialReasons.push(`GitHub search incomplete on page ${page}`);
      for (const repo of items) {
        const parsed = GithubRepoSchema.safeParse(repo);
        if (!parsed.success) invalid++;
        // Ties and star changes reorder results between the two calls, so a repo can appear on both pages.
        else if (!reposById.has(parsed.data.id)) reposById.set(parsed.data.id, parsed.data);
      }

      const remaining = response.headers.get('x-ratelimit-remaining');
      if (isRateLimitLow(remaining)) {
        partialReasons.push(
          `GitHub rate limit low (${remaining} requests left); stopped after page ${page}`,
        );
        break;
      }
      if (items.length < PER_PAGE) break;
    }

    if (invalid > 0) this.logger.warn(`Dropped ${invalid} invalid GitHub repositories`);
    if (partialReasons.length > 0) reportPartial?.(partialReasons.join('; '));
    return [...reposById.values()].map(toRawItem);
  }
}
