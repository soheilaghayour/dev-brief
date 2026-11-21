import { describe, expect, it } from 'vitest';
import { SEED_SOURCES } from './seedSources.js';

describe('sources.json (owner decision 2026-11-21, PRD §8.8)', () => {
  it('switches every RSS blog source off', () => {
    const rss = SEED_SOURCES.filter(({ kind }) => kind === 'rss');
    expect(rss.length).toBeGreaterThan(0);
    for (const source of rss) expect(source.enabled, source.slug).toBe(false);
  });

  it('keeps Hacker News, Dev.to and GitHub enabled', () => {
    for (const kind of ['hn', 'devto', 'github']) {
      const sources = SEED_SOURCES.filter((source) => source.kind === kind);
      expect(sources, kind).toHaveLength(1);
      expect(sources[0]?.enabled, kind).toBe(true);
    }
  });
});
