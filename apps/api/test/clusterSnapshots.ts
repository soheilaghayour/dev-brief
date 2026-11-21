import { readFileSync } from 'node:fs';
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
import type { RawItem } from '../src/modules/ingestion/sourceAdapter.js';
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

/** Merges items by canonical URL and by equal normalised titles within 72 h, as ingestion merges them. */
function asStories(items: readonly { kind: SourceKind; item: RawItem }[]) {
  const stories: SnapshotStory[] = [];
  for (const { kind, item } of items) {
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
  return stories;
}

/** Every recorded HN, Dev.to, RSS and GitHub item through its adapter, as ingestion would store it. */
export async function readSnapshotStories() {
  const items: { kind: SourceKind; item: RawItem }[] = [];
  for (const kind of ['hn', 'devto', 'rss', 'github'] as const) {
    for (const item of await itemsOf(kind)) items.push({ kind, item });
  }
  return asStories(items);
}

/** The day of `fixtures/hn-window` whose stories are new; the three days before it are their window. */
export const HN_WINDOW_NEW_DAY = {
  from: new Date('2025-11-18T00:00:00Z'),
  to: new Date('2025-11-19T00:00:00Z'),
};

/** The four days of HN stories in `fixtures/hn-window`, through `HnAdapter`, as ingestion would store them. */
export async function readHnWindowStories() {
  const recorded = JSON.parse(
    readFileSync(new URL('./fixtures/hn-window/items.json', import.meta.url), 'utf8'),
  ) as { id: number }[];
  const byId = new Map(recorded.map((item) => [item.id, item]));
  const items: { kind: SourceKind; item: RawItem }[] = [];
  // The adapter reads the first 100 ids of `topstories`, so the file is served 100 ids at a time.
  for (let start = 0; start < recorded.length; start += 100) {
    const ids = recorded.slice(start, start + 100).map(({ id }) => id);
    const fetchStub: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/topstories.json')) return Response.json(ids);
      return Response.json(byId.get(Number(/\/item\/(\d+)\.json$/.exec(url)?.[1])) ?? null);
    };
    const fetched = await new HnAdapter(httpWith(fetchStub)).fetch(
      { slug: 'hn', kind: 'hn' } as Source,
      { signal },
    );
    for (const item of fetched) items.push({ kind: 'hn', item });
  }
  return asStories(items);
}

/** The model calls of one run that creates the stories `isNew` picks: each new story is decided in `publishedAt` order against the decided stories within ±72 h, as `ClusteringStep` does, and every reply is `none`. */
export function modelCalls(
  stories: readonly SnapshotStory[],
  isNew: (story: SnapshotStory) => boolean = () => true,
) {
  const rows = stories
    .map((story, index) => ({
      story,
      row: {
        id: String(index).padStart(5, '0'),
        title: story.title,
        url: story.url,
        domain: new URL(story.canonicalUrl).hostname,
        excerpt: story.excerpt,
        normalizedTitle: story.normalizedTitle,
        publishedAt: story.publishedAt,
        profile: clusterProfile(story),
        clusterId: null,
        clusterMemberCount: null,
      } satisfies ClusterWindowRow,
    }))
    .sort(
      (a, b) =>
        a.row.publishedAt.getTime() - b.row.publishedAt.getTime() ||
        a.row.id.localeCompare(b.row.id),
    );
  const created = rows.filter(({ story }) => isNew(story)).map(({ row }) => row);
  const pool = new ClusterPool(
    rows.map(({ row }) => row),
    created.map(({ id }) => id),
  );
  const calls: { story: ClusterWindowRow; candidates: ClusterWindowRow[] }[] = [];
  for (const story of created) {
    const candidates = rankClusterCandidates(story, pool.windowOf(story));
    if (candidates.length > 0) calls.push({ story, candidates });
    pool.markDecided(story.id);
  }
  return { created: created.length, calls };
}
