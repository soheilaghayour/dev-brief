import {
  canonicalizeUrl,
  clusterProfile,
  normalizeTitle,
  rankClusterCandidates,
} from '@devbrief/shared';
import {
  ClusterPool,
  type ClusterWindowRow,
} from '../src/modules/clustering/clusterPool.service.js';
import { DevtoClient } from '../src/common/devto/devtoClient.js';
import { HttpClient } from '../src/common/http/httpClient.js';
import type { Source, SourceKind } from '../src/generated/prisma/client.js';
import { DevtoAdapter } from '../src/modules/ingestion/adapters/devto.adapter.js';
import { GithubAdapter } from '../src/modules/ingestion/adapters/github.adapter.js';
import { HnAdapter } from '../src/modules/ingestion/adapters/hn.adapter.js';
import { RssAdapter } from '../src/modules/ingestion/adapters/rss.adapter.js';
import { TITLE_DEDUP_WINDOW_MS } from '../src/modules/ingestion/ingestionRules.js';
import { devtoFixtureFetch } from './devtoFixtureFetch.js';
import { GITHUB_FIXTURE_NOW, githubFixtureFetch } from './githubFixtureFetch.js';
import { hnFixtureFetch } from './hnFixtureFetch.js';
import { RSS_FIXTURE_NOW, readRssFixture, type RssFixtureName } from './rssFixtures.js';

/** A story from the recorded snapshots as ingestion would store it. */
export type SnapshotStory = {
  title: string;
  url: string;
  canonicalUrl: string;
  normalizedTitle: string;
  excerpt: string | null;
  publishedAt: Date;
  sourceKind: SourceKind;
};

const signal = new AbortController().signal;
// random = 0 makes retry backoff instant.
const httpWith = (fetchStub: typeof fetch) => new HttpClient(fetchStub, () => 0);
const RECORDED_FEEDS = [
  'react-blog',
  'cloudflare-blog',
  'simon-willison',
] as const satisfies RssFixtureName[];

async function itemsOf(kind: SourceKind) {
  const source = { slug: kind, kind } as Source;
  switch (kind) {
    case 'hn':
      return new HnAdapter(httpWith(hnFixtureFetch())).fetch(source, { signal });
    case 'devto': {
      const devto = new DevtoClient(
        httpWith(devtoFixtureFetch()),
        async () => undefined,
        () => 0,
      );
      return new DevtoAdapter(devto).fetch(source, { signal });
    }
    case 'github':
      return new GithubAdapter(
        httpWith(githubFixtureFetch()),
        'test-token',
        () => GITHUB_FIXTURE_NOW,
      ).fetch(source, { signal });
    case 'rss': {
      const feeds = await Promise.all(
        RECORDED_FEEDS.map((name) =>
          new RssAdapter(
            httpWith(async () => new Response(readRssFixture(name))),
            () => RSS_FIXTURE_NOW,
          ).fetch({ ...source, slug: name, feedUrl: `https://${name}.test/feed` }, { signal }),
        ),
      );
      return feeds.flat();
    }
  }
}

/** Every recorded HN, Dev.to, RSS and GitHub item through its adapter, merged by canonical URL and by equal normalised titles within 72 h, as ingestion merges them. */
export async function readSnapshotStories() {
  const stories: SnapshotStory[] = [];
  for (const kind of ['hn', 'devto', 'rss', 'github'] as const) {
    for (const item of await itemsOf(kind)) {
      const canonicalUrl = canonicalizeUrl(item.url);
      const normalizedTitle = normalizeTitle(item.title);
      const merged = stories.some(
        (story) =>
          story.canonicalUrl === canonicalUrl ||
          (story.normalizedTitle === normalizedTitle &&
            Math.abs(story.publishedAt.getTime() - item.publishedAt.getTime()) <=
              TITLE_DEDUP_WINDOW_MS),
      );
      if (merged) continue;
      stories.push({
        title: item.title,
        url: item.url,
        canonicalUrl,
        normalizedTitle,
        excerpt: item.excerpt,
        publishedAt: item.publishedAt,
        sourceKind: kind,
      });
    }
  }
  return stories;
}

/** The stories that would get a model call if one run created them all: each is decided in `publishedAt` order against the decided stories within ±72 h, as `ClusteringStep` does, and every reply is `none`. */
export function storiesWithCandidates(stories: readonly SnapshotStory[]) {
  const rows: ClusterWindowRow[] = stories
    .map((story, index) => ({
      id: String(index).padStart(4, '0'),
      title: story.title,
      url: story.url,
      domain: new URL(story.canonicalUrl).hostname,
      excerpt: story.excerpt,
      normalizedTitle: story.normalizedTitle,
      publishedAt: story.publishedAt,
      profile: clusterProfile(story),
      clusterId: null,
      clusterMemberCount: null,
    }))
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime() || a.id.localeCompare(b.id));
  const pool = new ClusterPool(
    rows,
    rows.map(({ id }) => id),
  );
  const called: ClusterWindowRow[] = [];
  for (const story of rows) {
    if (rankClusterCandidates(story, pool.windowOf(story)).length > 0) called.push(story);
    pool.markDecided(story.id);
  }
  return called;
}
