import { describe, expect, it } from 'vitest';
import { hasSummaryInput, SUMMARY_MIN_COMMENTS } from './hasSummaryInput.js';

const hn = (commentsCount: number | null) => ({ commentsCount, source: { kind: 'hn' } });
const devto = (commentsCount: number | null) => ({ commentsCount, source: { kind: 'devto' } });
const rss = { commentsCount: null, source: { kind: 'rss' } };
const repo = { commentsCount: null, source: { kind: 'github' } };

describe('hasSummaryInput', () => {
  it('AC-2.3.12 is true for a Dev.to article with 0 comments', () => {
    expect(hasSummaryInput({ items: [devto(0)] })).toBe(true);
  });

  it('AC-2.3.12 is false for HN with 2 comments and true with 3', () => {
    expect(hasSummaryInput({ items: [hn(2)] })).toBe(false);
    expect(hasSummaryInput({ items: [hn(SUMMARY_MIN_COMMENTS)] })).toBe(true);
    expect(SUMMARY_MIN_COMMENTS).toBe(3);
  });

  it('AC-2.3.12 sums the comments over a cluster: 2 HN comments plus 1 more is true', () => {
    expect(hasSummaryInput({ items: [hn(1), hn(1), devto(1)] })).toBe(true);
    expect(hasSummaryInput({ items: [hn(1), hn(1)] })).toBe(false);
    expect(hasSummaryInput({ items: [hn(2), hn(1)] })).toBe(true);
  });

  it('AC-2.3.12 is false for a repo-only story and an RSS-only story with an excerpt', () => {
    expect(hasSummaryInput({ items: [repo] })).toBe(false);
    expect(hasSummaryInput({ items: [rss] })).toBe(false);
    expect(hasSummaryInput({ items: [rss, repo, hn(null)] })).toBe(false);
  });
});
