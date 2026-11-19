import { readFileSync } from 'node:fs';

const fixtureDir = new URL('./fixtures/hn/', import.meta.url);
export const fixtureTopStories = JSON.parse(
  readFileSync(new URL('topstories.json', fixtureDir), 'utf8'),
) as number[];
export const fixtureItems = JSON.parse(
  readFileSync(new URL('items.json', fixtureDir), 'utf8'),
) as Record<
  string,
  {
    id: number;
    type: string;
    score?: number;
    descendants?: number;
    time: number;
    url?: string;
    title?: string;
  }
>;

interface FixtureOptions {
  /** Ids appended to `topstories` beyond the first 100; the adapter must ignore them. */
  extraIds?: number[];
  /** The first N item requests answer HTTP 500. */
  failingItems?: number;
  /** The last N item requests answer a payload that is not an HN item. */
  garbledItems?: number;
}

/** A `fetch` stand-in that serves the recorded HN responses, so no test reaches the network. */
export function hnFixtureFetch({
  extraIds = [],
  failingItems = 0,
  garbledItems = 0,
}: FixtureOptions = {}): typeof fetch {
  const failing = new Set(fixtureTopStories.slice(0, failingItems));
  const garbled = new Set(garbledItems > 0 ? fixtureTopStories.slice(-garbledItems) : []);

  return async (input) => {
    const url = String(input);
    if (url.endsWith('/topstories.json')) {
      return Response.json([...fixtureTopStories, ...extraIds]);
    }
    const id = Number(/\/item\/(\d+)\.json$/.exec(url)?.[1]);
    if (failing.has(id)) return new Response('', { status: 500 });
    if (garbled.has(id)) return Response.json({ nonsense: true });
    return Response.json(fixtureItems[String(id)] ?? null);
  };
}
