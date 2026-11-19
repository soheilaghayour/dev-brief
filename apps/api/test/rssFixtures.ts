import { readFileSync } from 'node:fs';

const fixtureDir = new URL('./fixtures/rss/', import.meta.url);

export type RssFixtureName =
  'react-blog' | 'cloudflare-blog' | 'simon-willison' | 'edge-cases' | 'many-recent' | 'broken';

export function readRssFixture(name: RssFixtureName) {
  return readFileSync(new URL(`${name}.xml`, fixtureDir), 'utf8');
}

/** The moment the recorded feeds and the hand-made ones are measured from: the day they were fetched or written. */
export const RSS_FIXTURE_NOW = new Date('2026-11-19T21:00:00Z');
