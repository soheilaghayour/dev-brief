import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_OPEN_MS,
  isCircuitOpen,
  mapRawItem,
  nextSourceHealth,
  nextStoryFields,
  overallStatus,
  reportsSourceFailure,
  storyTags,
  titleDedupWindow,
} from './ingestionRules.js';
import type { RawItem } from './sourceAdapter.js';

const now = new Date('2026-03-01T12:00:00Z');

const rawItem: RawItem = {
  externalId: '1',
  url: 'https://www.Example.com/post/?utm_source=x&b=2&a=1#top',
  discussionUrl: null,
  title: 'Show HN: A Rust thing',
  author: null,
  publishedAt: now,
  points: 120,
  commentsCount: 7,
  reactionsCount: 30,
  stars: 1200,
  sourceTags: [],
  excerpt: null,
  readingTimeMinutes: null,
};

describe('mapRawItem', () => {
  it('derives canonical URL, domain and normalized title', () => {
    expect(mapRawItem('hn', rawItem)).toMatchObject({
      canonicalUrl: 'https://example.com/post?a=1&b=2',
      domain: 'example.com',
      normalizedTitle: 'a rust thing',
    });
  });

  it('measures engagement per source kind', () => {
    expect(mapRawItem('hn', rawItem).engagement).toBe(120);
    expect(mapRawItem('devto', rawItem).engagement).toBe(37);
    expect(mapRawItem('rss', rawItem).engagement).toBe(0);
    expect(mapRawItem('github', rawItem).engagement).toBe(1200);
  });

  it('throws on a URL that is not http(s)', () => {
    expect(() => mapRawItem('hn', { ...rawItem, url: 'javascript:alert(1)' })).toThrow();
  });
});

describe('storyTags', () => {
  it('tags from title, URL and source tags with the current taxonomy version', () => {
    const result = storyTags('Why we left', 'https://example.com/a', ['rust']);
    expect(result.tags).toContain('rust');
    expect(result.taggerVersion).toBeGreaterThanOrEqual(1);
  });
});

describe('titleDedupWindow', () => {
  it('spans 72 h either side', () => {
    const { from, to } = titleDedupWindow(now);
    expect(now.getTime() - from.getTime()).toBe(72 * 3600_000);
    expect(to.getTime() - now.getTime()).toBe(72 * 3600_000);
  });
});

describe('nextSourceHealth', () => {
  it('AC-1.2.8 resets the counter and closes the circuit on success', () => {
    expect(nextSourceHealth({ consecutiveFailures: 4 }, { ok: true }, now)).toEqual({
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      lastSuccessAt: now,
    });
  });

  it('counts a failure without opening the circuit below three', () => {
    expect(nextSourceHealth({ consecutiveFailures: 1 }, { ok: false, error: 'boom' }, now)).toEqual(
      { consecutiveFailures: 2, circuitOpenUntil: null, lastErrorAt: now, lastError: 'boom' },
    );
  });

  it('AC-1.2.8 opens the circuit for 6 h on the third failure and re-opens it on a half-open failure', () => {
    const open = new Date(now.getTime() + CIRCUIT_OPEN_MS);
    expect(
      nextSourceHealth({ consecutiveFailures: 2 }, { ok: false, error: 'x' }, now).circuitOpenUntil,
    ).toEqual(open);
    expect(
      nextSourceHealth({ consecutiveFailures: 3 }, { ok: false, error: 'x' }, now).circuitOpenUntil,
    ).toEqual(open);
  });

  it('truncates the error to 500 characters', () => {
    const health = nextSourceHealth(
      { consecutiveFailures: 0 },
      { ok: false, error: 'e'.repeat(900) },
      now,
    );
    expect(health.lastError).toHaveLength(500);
  });
});

describe('reportsSourceFailure', () => {
  it('reports the third consecutive failure only, not every retry (§8.3)', () => {
    expect([1, 2, 3, 4, 5].filter(reportsSourceFailure)).toEqual([3]);
  });
});

describe('isCircuitOpen', () => {
  it('is open only until circuitOpenUntil', () => {
    expect(isCircuitOpen({ circuitOpenUntil: null }, now)).toBe(false);
    expect(isCircuitOpen({ circuitOpenUntil: new Date(now.getTime() + 1) }, now)).toBe(true);
    expect(isCircuitOpen({ circuitOpenUntil: new Date(now.getTime() - 1) }, now)).toBe(false);
  });
});

describe('overallStatus', () => {
  it('is success when nothing failed, skipped sources included', () => {
    expect(overallStatus(['success', 'skipped'])).toBe('success');
  });

  it('is skipped when no source ran, so an outage never records as success', () => {
    expect(overallStatus(['skipped', 'skipped'])).toBe('skipped');
    expect(overallStatus([])).toBe('skipped');
  });

  it('is partial when some failed and some did not', () => {
    expect(overallStatus(['success', 'failed'])).toBe('partial');
  });

  it('is failed when every source that ran failed', () => {
    expect(overallStatus(['failed', 'failed', 'skipped'])).toBe('failed');
  });

  it('is partial when a source reported partial, even if none failed', () => {
    expect(overallStatus(['success', 'partial', 'skipped'])).toBe('partial');
    expect(overallStatus(['partial'])).toBe('partial');
    expect(overallStatus(['partial', 'failed'])).toBe('partial');
  });
});

describe('nextStoryFields', () => {
  const story = {
    title: 'A post',
    canonicalUrl: 'https://example.com/a',
    tags: [] as string[],
    taggerVersion: storyTags('A post', 'https://example.com/a', []).taggerVersion,
    publishedAt: now,
    excerpt: null,
    readingTimeMinutes: null,
  };
  const noExtras = { excerpt: null, readingTimeMinutes: null };

  it('is null when nothing changed', () => {
    expect(nextStoryFields(story, [{ sourceTags: [], publishedAt: now }], noExtras)).toBeNull();
  });

  it('adds the source tags of a title-joined item to the Story tags', () => {
    const items = [
      { sourceTags: [], publishedAt: now },
      { sourceTags: ['rust'], publishedAt: now },
    ];
    expect(nextStoryFields(story, items, noExtras)?.tags).toContain('rust');
  });

  it('moves publishedAt to the earliest item and fills a missing excerpt', () => {
    const earlier = new Date(now.getTime() - 3600_000);
    const fields = nextStoryFields(
      story,
      [
        { sourceTags: [], publishedAt: now },
        { sourceTags: [], publishedAt: earlier },
      ],
      { excerpt: 'Intro', readingTimeMinutes: 4 },
    );
    expect(fields).toMatchObject({ publishedAt: earlier, excerpt: 'Intro', readingTimeMinutes: 4 });
  });
});
