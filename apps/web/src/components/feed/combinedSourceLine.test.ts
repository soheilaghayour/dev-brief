import { describe, expect, it } from 'vitest';
import type { SourceKind, SourceRef } from '@devbrief/shared';
import { combinedSourceLine } from './combinedSourceLine';

let counter = 0;
function source(kind: SourceKind, numbers: Partial<SourceRef> = {}): SourceRef {
  counter += 1;
  return {
    kind,
    slug: kind,
    name: kind,
    itemUrl: `https://example.com/${kind}/${counter}`,
    points: null,
    comments: null,
    reactions: null,
    stars: null,
    ...numbers,
  };
}

const line = (sources: SourceRef[]) =>
  combinedSourceLine(sources)
    .map(
      ({ joiner, name, metric }) =>
        joiner + name + (metric ? ` (${metric.glyph} ${metric.value})` : ''),
    )
    .join('');

describe('combinedSourceLine', () => {
  it('AC-2.2.1 shows HN alone with its highest points', () => {
    expect(line([source('hn', { points: 120 }), source('hn', { points: 320 })])).toBe(
      'Trending on HN (▲ 320)',
    );
  });

  it('AC-2.2.1 joins HN and Dev.to with "&" and the highest reactions', () => {
    expect(
      line([
        source('devto', { reactions: 40 }),
        source('hn', { points: 320 }),
        source('devto', { reactions: 95 }),
      ]),
    ).toBe('Trending on HN (▲ 320) & Dev.to (♥ 95)');
  });

  it('AC-2.2.1 counts RSS items as blogs after a "·"', () => {
    expect(
      line([
        source('hn', { points: 320 }),
        source('devto', { reactions: 95 }),
        source('rss'),
        source('rss'),
      ]),
    ).toBe('Trending on HN (▲ 320) & Dev.to (♥ 95) · 2 blogs');
    expect(line([source('rss')])).toBe('1 blog');
    expect(line([source('rss'), source('rss'), source('rss')])).toBe('3 blogs');
  });

  it('AC-2.2.1 shows the highest GitHub stars, compact', () => {
    expect(line([source('github', { stars: 900 }), source('github', { stars: 1234 })])).toBe(
      'GitHub (★ 1.2k)',
    );
    expect(line([source('hn', { points: 10 }), source('github', { stars: 50 })])).toBe(
      'Trending on HN (▲ 10) · GitHub (★ 50)',
    );
  });

  it('AC-2.2.1 keeps a fixed kind order whatever order the sources come in', () => {
    expect(
      line([
        source('github', { stars: 5 }),
        source('rss'),
        source('devto', { reactions: 2 }),
        source('hn', { points: 1 }),
      ]),
    ).toBe('Trending on HN (▲ 1) & Dev.to (♥ 2) · 1 blog · GitHub (★ 5)');
  });

  it('names a source without a count and starts a blog-only line without the lead-in', () => {
    expect(line([source('hn'), source('rss')])).toBe('Trending on HN · 1 blog');
    expect(combinedSourceLine([source('rss')])[0]?.joiner).toBe('');
  });
});
