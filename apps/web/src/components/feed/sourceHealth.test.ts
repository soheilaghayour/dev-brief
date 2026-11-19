import { describe, expect, it } from 'vitest';
import type { SourceList } from '@devbrief/shared';
import { countUnhealthy, kindHealth } from './sourceHealth';

function source(
  slug: string,
  kind: SourceList['sources'][number]['kind'],
  status: SourceList['sources'][number]['status'],
  lastSuccessAt: string | null,
) {
  return { slug, kind, name: slug, siteUrl: 'https://example.com', status, lastSuccessAt };
}

const sources = [
  source('hn', 'hn', 'healthy', '2026-11-19T11:50:00.000Z'),
  source('blog-a', 'rss', 'healthy', '2026-11-19T11:00:00.000Z'),
  source('blog-b', 'rss', 'circuit_open', '2026-11-19T09:00:00.000Z'),
  source('blog-c', 'rss', 'stale', null),
];

describe('kindHealth', () => {
  it('AC-1.3.11 shows the worst status among a group of blogs', () => {
    expect(kindHealth(sources, 'rss')?.status).toBe('circuit_open');
    expect(kindHealth(sources, 'hn')?.status).toBe('healthy');
  });

  it('AC-1.3.11 reports the latest success for the tooltip', () => {
    expect(kindHealth(sources, 'rss')?.lastSuccessAt).toBe('2026-11-19T11:00:00.000Z');
  });

  it('is null for a kind without sources and has no success time when none succeeded', () => {
    expect(kindHealth(sources, 'devto')).toBeNull();
    expect(kindHealth([source('x', 'devto', 'stale', null)], 'devto')?.lastSuccessAt).toBeNull();
  });
});

describe('countUnhealthy', () => {
  it('counts every source that is not healthy', () => {
    expect(countUnhealthy(sources)).toBe(2);
  });
});
